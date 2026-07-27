// Admin-Änderungen an bestehenden Konten müssen in Keycloak erfolgen:
// Von dort stammen die autoritativen Rollen- und Marktclaims.
import { json, parseJsonBody } from "./_lib/http.mjs";
import {
  KNOWN_REALM_ROLES,
  getServiceAccountToken,
  hasAdminRole,
  keycloakAdminFetch,
  verifyKeycloakToken,
} from "./_lib/keycloak.mjs";

const ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/;
const MARKET_PATTERN = /^[A-Z]{2,3}$/;

async function authorize(event) {
  const verified = await verifyKeycloakToken(event?.headers);
  if (!verified.ok) return { ok: false, response: json(verified.status, { code: verified.code, message: verified.message }) };
  if (!hasAdminRole(verified.identity)) {
    return { ok: false, response: json(403, { code: "FORBIDDEN", message: "Adminrolle erforderlich." }) };
  }
  return { ok: true };
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

export const handler = async (event) => {
  if (String(event?.httpMethod ?? "").toUpperCase() !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Nur POST ist erlaubt." }, { Allow: "POST" });
  }
  const auth = await authorize(event);
  if (!auth.ok) return auth.response;
  const parsed = parseJsonBody(event);
  if (!parsed.ok) return json(400, { code: "INVALID_INPUT", message: "JSON-Objekt erwartet." });

  const { operation, userId } = parsed.value;
  if (!["active", "roles", "markets", "delete"].includes(operation) || !ID_PATTERN.test(String(userId ?? ""))) {
    return json(400, { code: "INVALID_INPUT", message: "Operation oder Benutzer-ID ist ungültig." });
  }
  const service = await getServiceAccountToken();
  if (!service.ok) return json(service.status, { code: service.code, message: service.message });

  try {
    let ok = false;
    if (operation === "active") {
      if (typeof parsed.value.active !== "boolean") {
        return json(400, { code: "INVALID_INPUT", message: "active muss boolean sein." });
      }
      const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
        method: "PUT", token: service.token, body: { enabled: parsed.value.active },
      });
      ok = response.ok;
      if (ok && parsed.value.active === false) {
        await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}/logout`, {
          method: "POST", token: service.token,
        });
      }
    } else if (operation === "roles") {
      const roles = Array.isArray(parsed.value.roles) ? [...new Set(parsed.value.roles)] : [];
      if (!roles.length || roles.some((role) => !KNOWN_REALM_ROLES.includes(role))) {
        return json(400, { code: "INVALID_INPUT", message: "Mindestens eine gültige Rolle ist erforderlich." });
      }
      ok = await updateRoles(userId, roles, service.token);
    } else if (operation === "markets") {
      const markets = Array.isArray(parsed.value.markets) ? [...new Set(parsed.value.markets)] : [];
      if (markets.some((market) => typeof market !== "string" || !MARKET_PATTERN.test(market))) {
        return json(400, { code: "INVALID_INPUT", message: "Marktcodes sind ungültig." });
      }
      ok = await updateMarkets(userId, markets, service.token);
    } else {
      const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
        method: "DELETE", token: service.token,
      });
      ok = response.ok;
    }

    if (!ok) return json(502, { code: "KEYCLOAK_ERROR", message: "Änderung in Keycloak fehlgeschlagen." });
    return json(200, { message: "Benutzer aktualisiert." });
  } catch (error) {
    console.error("[admin-user] Keycloak-Aufruf fehlgeschlagen:", error?.name ?? "unknown");
    return json(502, { code: "KEYCLOAK_UNREACHABLE", message: "Keycloak ist nicht erreichbar." });
  }
};
