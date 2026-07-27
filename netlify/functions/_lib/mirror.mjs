// ============================================================
// Spiegelung der Benutzerdaten nach Supabase (R-11).
//
// Führendes System ist Keycloak: Von dort stammen die Ansprüche im Token, und
// nur sie entscheiden über Zugriff. Die Tabellen in der Plattform sind eine
// Abschrift – sie beantworten „wer ist das?" und „wer gehört wozu?", aber sie
// erteilen keine Rechte.
//
// Genau deshalb ist die Reihenfolge festgelegt: erst Keycloak, dann die
// Abschrift. Andersherum könnte die Plattform kurzzeitig eine Rolle anzeigen,
// die es im führenden System nie gab.
//
// Und deshalb ist ein Fehlschlag der Abschrift kein Grund, den ganzen Vorgang
// als gescheitert zu melden: Die Änderung IST passiert. Sie zurückzunehmen
// wäre ein zweiter Schreibvorgang, der ebenfalls scheitern kann – man tauscht
// ein Problem gegen dasselbe Problem. Stattdessen wird der offene Abgleich
// festgehalten und angezeigt.
//
// Alle Schreibvorgänge sind auf den ZIELZUSTAND formuliert, nicht auf die
// Änderung. Ein zweiter Durchlauf stellt denselben Zustand her wie der erste.
// ============================================================

import { supabaseConfig } from "./supabase.mjs";

const TIMEOUT_MS = 10_000;
const RETRIES = 2;
const RETRY_DELAY_MS = 300;

async function rest(path, { method = "GET", body, prefer, query } = {}) {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { ok: false, status: 0, data: null, error: "CONFIG_ERROR" };

  const url = new URL(`${cfg.url}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text().catch(() => "");
    let data = null;
    if (text !== "") { try { data = JSON.parse(text); } catch { data = null; } }
    if (!response.ok) {
      return {
        ok: false, status: response.status, data,
        error: typeof data?.code === "string" ? data.code : `HTTP_${response.status}`,
      };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error?.name ?? "UNREACHABLE" };
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wiederholt einen Schritt bei vorübergehenden Fehlern.
 *
 * Nur bei Netzproblemen und Serverfehlern. Ein 400er käme beim zweiten Versuch
 * genauso zurück – ihn zu wiederholen kostet nur Zeit und verdeckt die Ursache.
 */
async function withRetry(step) {
  let last = { ok: false, error: "UNKNOWN" };
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    last = await step();
    if (last.ok) return last;
    const transient = last.status === 0 || last.status >= 500 || last.status === 429;
    if (!transient) return last;
    if (attempt < RETRIES) await wait(RETRY_DELAY_MS * (attempt + 1));
  }
  return last;
}

/** Findet die app_user-Zeile zur Keycloak-Kennung. */
async function findAppUser(externalId, tenant) {
  const found = await rest("/rest/v1/app_user", {
    query: {
      select: "id",
      issuer: "eq.keycloak",
      subject: `eq.${externalId}`,
      ...(tenant ? { tenant: `eq.${tenant}` } : {}),
      limit: "1",
    },
  });
  const row = Array.isArray(found.data) ? found.data[0] : null;
  return typeof row?.id === "string" ? row.id : null;
}

/** Setzt den Aktivierungsstatus. */
async function mirrorActive(appUserId, active) {
  return rest("/rest/v1/app_user", {
    method: "PATCH",
    query: { id: `eq.${appUserId}` },
    prefer: "return=minimal",
    body: { active: Boolean(active) },
  });
}

/**
 * Setzt die Rollen auf genau diese Menge.
 *
 * Zuerst einfügen, dann das Überzählige entfernen. Andersherum – erst löschen,
 * dann schreiben – stünde die Person zwischen beiden Anweisungen ohne jede
 * Rolle da. Genau das war der Fehler in der Browser-Fassung.
 */
async function mirrorRoles(appUserId, roles) {
  const wanted = [...new Set(roles)];
  if (wanted.length) {
    const inserted = await rest("/rest/v1/user_role_assignment", {
      method: "POST",
      query: { on_conflict: "user_id,role" },
      prefer: "resolution=merge-duplicates,return=minimal",
      body: wanted.map((role) => ({ user_id: appUserId, role })),
    });
    if (!inserted.ok) return inserted;
  }
  return rest("/rest/v1/user_role_assignment", {
    method: "DELETE",
    query: {
      user_id: `eq.${appUserId}`,
      ...(wanted.length ? { role: `not.in.(${wanted.join(",")})` } : {}),
    },
    prefer: "return=minimal",
  });
}

/** Setzt die Marktzuordnung auf genau diese Menge – gleiche Reihenfolge wie oben. */
async function mirrorMarkets(appUserId, marketCodes) {
  const codes = [...new Set(marketCodes)].filter((c) => typeof c === "string" && c !== "");

  let ids = [];
  if (codes.length) {
    const resolved = await rest("/rest/v1/market", {
      query: { select: "id,code", code: `in.(${codes.join(",")})` },
    });
    if (!resolved.ok) return resolved;
    ids = (Array.isArray(resolved.data) ? resolved.data : [])
      .map((m) => m?.id).filter((id) => typeof id === "string");

    if (ids.length) {
      const inserted = await rest("/rest/v1/user_market", {
        method: "POST",
        query: { on_conflict: "user_id,market_id" },
        prefer: "resolution=merge-duplicates,return=minimal",
        body: ids.map((market_id) => ({ user_id: appUserId, market_id })),
      });
      if (!inserted.ok) return inserted;
    }
  }

  return rest("/rest/v1/user_market", {
    method: "DELETE",
    query: {
      user_id: `eq.${appUserId}`,
      ...(ids.length ? { market_id: `not.in.(${ids.join(",")})` } : {}),
    },
    prefer: "return=minimal",
  });
}

/** Entfernt die Spiegelung. Fremdschlüssel räumen Zuordnungen mit ab. */
async function mirrorDelete(appUserId) {
  return rest("/rest/v1/app_user", {
    method: "DELETE",
    query: { id: `eq.${appUserId}` },
    prefer: "return=minimal",
  });
}

/**
 * Führt die Spiegelung für eine Änderung aus.
 *
 * @param {{operation: string, externalId: string, tenant?: string, payload: object}} task
 * @returns {Promise<{ok: boolean, error?: string, reason?: string}>}
 */
export async function mirrorUserChange(task) {
  const { operation, externalId, tenant, payload = {} } = task;

  const appUserId = await withRetry(async () => {
    const id = await findAppUser(externalId, tenant);
    return id ? { ok: true, id } : { ok: false, status: 0, error: "NOT_MIRRORED" };
  });

  if (!appUserId.ok) {
    // Kein Spiegelbild vorhanden. Beim Löschen ist das der gewünschte Zustand –
    // es gibt nichts zu entfernen. Sonst ist es ein echter Fehlschlag.
    if (operation === "delete") return { ok: true, reason: "NICHT_GESPIEGELT" };
    return { ok: false, error: "NOT_MIRRORED" };
  }

  const id = appUserId.id;
  const step =
    operation === "active"  ? () => mirrorActive(id, payload.active)
    : operation === "roles"   ? () => mirrorRoles(id, payload.roles ?? [])
    : operation === "markets" ? () => mirrorMarkets(id, payload.markets ?? [])
    : operation === "delete"  ? () => mirrorDelete(id)
    : null;

  if (!step) return { ok: false, error: "UNKNOWN_OPERATION" };

  const result = await withRetry(step);
  return result.ok ? { ok: true, appUserId: id } : { ok: false, error: result.error, appUserId: id };
}

/**
 * Hält einen offenen Abgleich fest.
 *
 * Bewusst der ZIELZUSTAND, nicht die Änderung: Ein späterer Versuch soll
 * denselben Endzustand herstellen, unabhängig davon, was inzwischen geschehen
 * ist. Der eindeutige Index sorgt dafür, dass ein neuerer Auftrag den älteren
 * für dieselbe Sache ersetzt – zwei offene Einträge wären derselbe Auftrag
 * zweimal, mit womöglich widersprüchlichem Ziel.
 */
export async function recordPendingSync({ operation, externalId, appUserId, payload, error, actorLabel }) {
  const result = await rest("/rest/v1/sync_outbox", {
    method: "POST",
    query: { on_conflict: "kind,external_id" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: [{
      kind: `user.${operation}`,
      external_id: String(externalId),
      app_user_id: appUserId ?? null,
      payload: payload ?? {},
      attempts: 1,
      last_error: String(error ?? "").slice(0, 300),
      actor_label: String(actorLabel ?? "unbekannt").slice(0, 200),
    }],
  });
  if (!result.ok) {
    // Jetzt ist auch die Notiz über den Fehlschlag fehlgeschlagen. Mehr als
    // laut zu sein bleibt hier nicht.
    console.error("[mirror] Offener Abgleich konnte nicht vermerkt werden:", result.error);
  }
  return result.ok;
}

/** Liest offene Abgleiche. */
export async function listPendingSync(limit = 50) {
  const result = await rest("/rest/v1/sync_outbox", {
    query: {
      select: "id,kind,external_id,app_user_id,payload,attempts,last_error,created_at,actor_label",
      resolved_at: "is.null",
      order: "created_at.asc",
      limit: String(limit),
    },
  });
  return result.ok && Array.isArray(result.data) ? result.data : null;
}

/** Markiert einen Abgleich als erledigt. */
async function resolvePendingSync(id) {
  return rest("/rest/v1/sync_outbox", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    prefer: "return=minimal",
    body: { resolved_at: new Date().toISOString() },
  });
}

/** Vermerkt einen weiteren erfolglosen Versuch. */
async function bumpAttempt(row, error) {
  return rest("/rest/v1/sync_outbox", {
    method: "PATCH",
    query: { id: `eq.${row.id}` },
    prefer: "return=minimal",
    body: {
      attempts: Number(row.attempts ?? 0) + 1,
      last_error: String(error ?? "").slice(0, 300),
      last_try_at: new Date().toISOString(),
    },
  });
}

/**
 * Arbeitet alle offenen Abgleiche ab.
 * @returns {Promise<{total: number, resolved: number, failed: number, errors: string[]}>}
 */
export async function reconcilePendingSync() {
  const rows = await listPendingSync(200);
  if (!rows) return { total: 0, resolved: 0, failed: 0, errors: ["OUTBOX_UNREACHABLE"] };

  let resolved = 0, failed = 0;
  const errors = [];

  for (const row of rows) {
    const operation = String(row.kind ?? "").replace(/^user\./, "");
    const result = await mirrorUserChange({
      operation,
      externalId: row.external_id,
      payload: row.payload ?? {},
    });
    if (result.ok) {
      await resolvePendingSync(row.id);
      resolved++;
    } else {
      await bumpAttempt(row, result.error);
      failed++;
      if (!errors.includes(result.error)) errors.push(result.error);
    }
  }

  return { total: rows.length, resolved, failed, errors };
}
