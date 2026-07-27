// ============================================================
// POST /api/admin/user            – Konto ändern (Status, Rollen, Märkte, Löschen)
// POST /api/admin/user/reconcile  – offene Abgleiche erneut versuchen
// GET  /api/admin/user/pending    – offene Abgleiche auflisten
//
// Führendes System ist Keycloak: Von dort stammen die Ansprüche im Token, und
// nur sie entscheiden über Zugriff. Die Tabellen in der Plattform sind eine
// Abschrift.
//
// ── Was sich mit R-11 geändert hat ───────────────────────────────────────────
// Vorher lief nur der Keycloak-Teil hier; die Spiegelung nach Supabase machte
// der BROWSER hinterher. Dazwischen lagen ein Netzweg, ein Tab, der geschlossen
// werden kann, und ein Token, das ablaufen kann. Scheiterte der zweite Schritt,
// liefen Ansprüche und Abschrift auseinander – unbemerkt, weil beide Systeme
// für sich stimmig aussehen.
//
// Bei Rollen und Märkten war es schlimmer: Der Browser löschte erst alle
// Zuordnungen und schrieb dann die neuen. Ein Abbruch dazwischen ließ die
// Person ganz ohne Rolle zurück.
//
// Jetzt laufen beide Schritte hier, in dieser Reihenfolge, und ein Fehlschlag
// der Abschrift wird festgehalten und angezeigt statt verschluckt.
// ============================================================

import { json, parseJsonBody, requestPath } from "./_lib/http.mjs";
import {
  KNOWN_REALM_ROLES,
  getServiceAccountToken,
  hasAdminRole,
  keycloakAdminFetch,
  verifyKeycloakToken,
} from "./_lib/keycloak.mjs";
import { audit } from "./_lib/guard.mjs";
import { listPendingSync, mirrorUserChange, recordPendingSync, reconcilePendingSync } from "./_lib/mirror.mjs";

const ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;
const MARKET_PATTERN = /^[A-Z]{2,3}$/;

async function authorize(event) {
  const verified = await verifyKeycloakToken(event?.headers);
  if (!verified.ok) {
    return { ok: false, response: json(verified.status, { code: verified.code, message: verified.message }) };
  }
  if (!hasAdminRole(verified.identity)) {
    return { ok: false, response: json(403, { code: "FORBIDDEN", message: "Adminrolle erforderlich." }) };
  }
  // Die Identität muss mit zurück: Ohne sie schrieb das Protokoll bisher
  // „unbekannt" als handelnde Person – ein Audit-Trail, der nicht sagt, WER
  // gehandelt hat, ist keiner.
  return { ok: true, identity: verified.identity };
}

async function roleRepresentations(token, roles) {
  const rows = await Promise.all(roles.map(async (role) => {
    const response = await keycloakAdminFetch(`/roles/${encodeURIComponent(role)}`, { token });
    if (!response.ok) return null;
    const row = await response.json().catch(() => null);
    return row?.name === role && typeof row?.id === "string" ? { id: row.id, name: row.name } : null;
  }));
  return rows.every(Boolean) ? rows : null;
}

async function updateRoles(userId, roles, token) {
  const desired = await roleRepresentations(token, roles);
  if (!desired) return false;
  const currentResponse = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    { token },
  );
  if (!currentResponse.ok) return false;
  const current = await currentResponse.json().catch(() => []);
  const managed = Array.isArray(current)
    ? current.filter((role) => KNOWN_REALM_ROLES.includes(role?.name))
      .map((role) => ({ id: role.id, name: role.name }))
    : [];
  if (managed.length) {
    const removed = await keycloakAdminFetch(
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: "DELETE", token, body: managed },
    );
    if (!removed.ok) return false;
  }
  if (!desired.length) return true;
  const added = await keycloakAdminFetch(
    `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    { method: "POST", token, body: desired },
  );
  if (added.ok) return true;
  // Best-effort-Rollback: die bisherige Rollenmenge wiederherstellen.
  if (managed.length) {
    await keycloakAdminFetch(
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: "POST", token, body: managed },
    );
  }
  return false;
}

async function updateMarkets(userId, markets, token) {
  const path = `/users/${encodeURIComponent(userId)}`;
  const current = await keycloakAdminFetch(path, { token });
  if (!current.ok) return false;
  const user = await current.json().catch(() => null);
  if (!user || typeof user !== "object") return false;
  const attributes = { ...(user.attributes ?? {}), markets: [markets.join(",")] };
  const updated = await keycloakAdminFetch(path, { method: "PUT", token, body: { ...user, attributes } });
  return updated.ok;
}

/** Offene Abgleiche auflisten – für die Anzeige in der Verwaltung. */
async function handlePending() {
  const rows = await listPendingSync();
  if (rows === null) {
    return json(502, { code: "OUTBOX_UNREACHABLE", message: "Offene Abgleiche sind nicht abrufbar." });
  }
  return json(200, {
    pending: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      externalId: r.external_id,
      attempts: r.attempts,
      lastError: r.last_error,
      createdAt: r.created_at,
      actorLabel: r.actor_label,
    })),
  });
}

/** Offene Abgleiche erneut versuchen. */
async function handleReconcile(identity) {
  const result = await reconcilePendingSync();
  void audit({
    identity,
    action: "user.reconcile",
    targetType: "sync_outbox",
    outcome: result.failed === 0 ? "ok" : "partial",
    detail: { geprueft: result.total, erledigt: result.resolved, offen: result.failed },
  });
  return json(200, {
    checked: result.total,
    resolved: result.resolved,
    failed: result.failed,
    message: result.total === 0
      ? "Es gibt keine offenen Abgleiche."
      : result.failed === 0
        ? `${result.resolved} Abgleich(e) nachgeholt.`
        : `${result.resolved} nachgeholt, ${result.failed} weiterhin offen.`,
  });
}

export const handler = async (event) => {
  const method = String(event?.httpMethod ?? "").toUpperCase();
  const path = requestPath(event);
  const route = path.replace(/^.*\/user/, "").replace(/\/+$/, "") || "/";

  if (method !== "POST" && !(method === "GET" && route === "/pending")) {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Nur POST ist erlaubt." }, { Allow: "POST" });
  }

  const auth = await authorize(event);
  if (!auth.ok) return auth.response;

  if (route === "/pending") return handlePending();
  if (route === "/reconcile") return handleReconcile(auth.identity);

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return json(400, { code: "INVALID_INPUT", message: "JSON-Objekt erwartet." });

  const { operation, userId } = parsed.value;
  if (!["active", "roles", "markets", "delete"].includes(operation) || !ID_PATTERN.test(String(userId ?? ""))) {
    return json(400, { code: "INVALID_INPUT", message: "Operation oder Benutzer-ID ist ungültig." });
  }

  // Eingaben vollständig prüfen, BEVOR irgendetwas geschrieben wird. Eine
  // Ablehnung nach der Keycloak-Änderung wäre der schlechteste Zeitpunkt.
  let payload = {};
  if (operation === "active") {
    if (typeof parsed.value.active !== "boolean") {
      return json(400, { code: "INVALID_INPUT", message: "active muss boolean sein." });
    }
    payload = { active: parsed.value.active };
  } else if (operation === "roles") {
    const roles = Array.isArray(parsed.value.roles) ? [...new Set(parsed.value.roles)] : [];
    if (!roles.length || roles.some((role) => !KNOWN_REALM_ROLES.includes(role))) {
      return json(400, { code: "INVALID_INPUT", message: "Mindestens eine gültige Rolle ist erforderlich." });
    }
    payload = { roles };
  } else if (operation === "markets") {
    const markets = Array.isArray(parsed.value.markets) ? [...new Set(parsed.value.markets)] : [];
    if (markets.some((market) => typeof market !== "string" || !MARKET_PATTERN.test(market))) {
      return json(400, { code: "INVALID_INPUT", message: "Marktcodes sind ungültig." });
    }
    payload = { markets };
  }

  const service = await getServiceAccountToken();
  if (!service.ok) return json(service.status, { code: service.code, message: service.message });

  try {
    // ── Schritt 1: das führende System ───────────────────────────────────────
    let ok = false;
    if (operation === "active") {
      const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
        method: "PUT", token: service.token, body: { enabled: payload.active },
      });
      ok = response.ok;
      if (ok && payload.active === false) {
        // Ein gesperrtes Konto mit noch laufender Sitzung wäre nicht gesperrt.
        await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}/logout`, {
          method: "POST", token: service.token,
        });
      }
    } else if (operation === "roles") {
      ok = await updateRoles(userId, payload.roles, service.token);
    } else if (operation === "markets") {
      ok = await updateMarkets(userId, payload.markets, service.token);
    } else {
      const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
        method: "DELETE", token: service.token,
      });
      ok = response.ok;
    }

    if (!ok) {
      void audit({
        identity: auth.identity, action: `user.${operation}`, targetType: "keycloak_user",
        targetId: userId, outcome: "failed", detail: payload,
      });
      return json(502, { code: "KEYCLOAK_ERROR", message: "Änderung in Keycloak fehlgeschlagen." });
    }

    // ── Schritt 2: die Abschrift ─────────────────────────────────────────────
    const mirror = await mirrorUserChange({
      operation,
      externalId: String(userId),
      tenant: auth.identity?.tenant,
      payload,
    });

    if (!mirror.ok) {
      await recordPendingSync({
        operation,
        externalId: String(userId),
        appUserId: mirror.appUserId ?? null,
        payload,
        error: mirror.error,
        actorLabel: auth.identity?.email ?? auth.identity?.name ?? null,
      });
    }

    void audit({
      identity: auth.identity,
      action: `user.${operation}`,
      targetType: "keycloak_user",
      targetId: userId,
      outcome: mirror.ok ? "ok" : "partial",
      detail: mirror.ok ? payload : { ...payload, spiegelung: mirror.error },
    });

    // Bewusst 200 und nicht 502: Die Änderung IST passiert. Ein Fehlercode
    // würde zum erneuten Versuch einladen und die Keycloak-Änderung ein
    // zweites Mal anstoßen. Der Teilfehler steht stattdessen im Ergebnis –
    // sichtbar, benannt und nachholbar.
    if (!mirror.ok) {
      return json(200, {
        status: "partial",
        message:
          "Die Änderung ist in der Anmeldung wirksam, die Übernahme in die " +
          "Plattform steht noch aus. Sie kann in der Verwaltung nachgeholt werden.",
        mirrorError: mirror.error,
      });
    }
    return json(200, { status: "ok", message: "Benutzer aktualisiert." });
  } catch (error) {
    console.error("[admin-user] Keycloak-Aufruf fehlgeschlagen:", error?.name ?? "unknown");
    return json(502, { code: "KEYCLOAK_UNREACHABLE", message: "Keycloak ist nicht erreichbar." });
  }
};
