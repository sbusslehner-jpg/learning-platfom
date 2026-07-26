// ============================================================
// Gemeinsame Keycloak-Bausteine für alle Netlify Functions.
//
// WICHTIG: Es gibt hier genau EINE Implementierung der Token-Prüfung.
// `auth-exchange` und `admin-invite` importieren dieselbe Funktion.
// Zwei parallele Prüfpfade wären die wahrscheinlichste Ursache dafür,
// dass eine Verschärfung an einer Stelle an der anderen vergessen wird.
//
// Vertrag: auth/README.md (Realm `serviceq`, SPA-Client `learning-platform`,
// Backend-Client `platform-backend`, Realm-Rollen admin/editor/user).
// ============================================================

import { createRemoteJWKSet, jwtVerify } from "jose";
import { getHeader } from "./http.mjs";

/**
 * Allowlist der Realm-Rollen. Rollen aus einem Token, die hier nicht
 * stehen, werden verworfen – die Anwendung soll nie mit unbekannten
 * Rollennamen arbeiten (z. B. Keycloak-Standardrollen wie
 * `offline_access` oder `default-roles-serviceq`).
 */
export const KNOWN_REALM_ROLES = Object.freeze(["admin", "editor", "user"]);

/** Öffentlicher SPA-Client – nur dessen Tokens werden akzeptiert. */
export const SPA_CLIENT_ID = "learning-platform";

/** Vertraulicher Backend-Client (Service-Account mit `manage-users`). */
export const DEFAULT_BACKEND_CLIENT_ID = "platform-backend";

/** Zeitlimit für alle ausgehenden Keycloak-Aufrufe (ms). */
const OUTBOUND_TIMEOUT_MS = 10_000;

/**
 * Liest die Keycloak-Konfiguration bei JEDEM Aufruf frisch aus der
 * Umgebung (nicht beim Modul-Import). Damit bleiben die Funktionen in
 * Tests und bei Deploy-Umschaltungen konfigurierbar.
 */
export function keycloakConfig() {
  const baseUrl = String(process.env.KEYCLOAK_URL ?? "").trim().replace(/\/+$/, "");
  const realm = String(process.env.KEYCLOAK_REALM ?? "").trim() || "serviceq";
  return {
    baseUrl,
    realm,
    configured: baseUrl.length > 0,
    issuer: `${baseUrl}/realms/${realm}`,
    certsUrl: `${baseUrl}/realms/${realm}/protocol/openid-connect/certs`,
    tokenUrl: `${baseUrl}/realms/${realm}/protocol/openid-connect/token`,
    adminBase: `${baseUrl}/admin/realms/${realm}`,
  };
}

// ── JWKS-Cache ───────────────────────────────────────────────────────────────
// `createRemoteJWKSet` cacht die Schlüssel intern und holt sie nur bei
// unbekannter `kid` neu. Deshalb MUSS das Set über Function-Invocations
// hinweg leben (Modul-Scope): pro Request neu erzeugen würde bei jedem
// Login einen HTTP-Roundtrip zu Keycloak auslösen und wäre zugleich ein
// bequemer DoS-Hebel gegen den Identity-Provider.
// Der Cache ist nach der Certs-URL geschlüsselt, damit ein Wechsel von
// KEYCLOAK_URL/REALM nicht versehentlich alte Schlüssel weiterverwendet.
const jwksCache = new Map();

function remoteJwks(certsUrl) {
  let set = jwksCache.get(certsUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL(certsUrl), { timeoutDuration: OUTBOUND_TIMEOUT_MS });
    jwksCache.set(certsUrl, set);
  }
  return set;
}

/** Nimmt den ersten String – Keycloak liefert Attribute teils als Array. */
function firstString(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const hit = value.find((v) => typeof v === "string" && v.trim() !== "");
    return typeof hit === "string" ? hit : "";
  }
  return "";
}

/**
 * Zerlegt das `markets`-Attribut. Laut Vertrag eine Komma-Liste
 * (`"DE,AT"`), Keycloak kann sie aber auch als Array ausliefern –
 * beides wird auf ein bereinigtes Array normalisiert.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseMarkets(raw) {
  const source = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const out = [];
  for (const entry of source) {
    if (typeof entry !== "string") continue;
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed !== "" && !out.includes(trimmed)) out.push(trimmed);
    }
  }
  return out;
}

/**
 * `tenant` ist Teil des Identitätsschlüssels in `app_user`
 * (Unique-Index issuer+tenant+subject). Ein NULL-Tenant würde die
 * Eindeutigkeit aushebeln, weil NULL in Postgres nie kollidiert – deshalb
 * fällt ein fehlender Tenant auf den Realm-Namen zurück. `auth-exchange`
 * und `admin-invite` nutzen dieselbe Normalisierung, damit Einladung und
 * spätere Anmeldung dieselbe Zeile treffen.
 * @param {unknown} raw
 * @param {string} realm
 */
export function normalizeTenant(raw, realm) {
  const value = firstString(raw).trim();
  return value !== "" ? value : realm;
}

/**
 * Liest das Bearer-Token aus dem Authorization-Header.
 * Bewusst streng: nur `Bearer <token>` mit genau einem Leerzeichen-Block.
 * @param {Record<string,unknown>|undefined} headers
 * @returns {string|null}
 */
export function readBearerToken(headers) {
  const raw = getHeader(headers, "authorization");
  if (!raw) return null;
  const match = /^Bearer[ \t]+([A-Za-z0-9._~+/-]+=*)$/.exec(raw.trim());
  if (!match) return null;
  const token = match[1];
  // Ein Access Token ist ein JWS mit drei Segmenten. Alles andere gar nicht
  // erst an die Kryptoprüfung weiterreichen.
  return token.split(".").length === 3 ? token : null;
}

/**
 * Prüft ein Keycloak-Access-Token kryptografisch und leitet die Identität ab.
 *
 * Prüfschritte (alle sicherheitsrelevant):
 *  1. Bearer-Header vorhanden und wohlgeformt
 *  2. Signatur gegen die JWKS des Realms (nur RS256 – kein `alg: none`,
 *     kein HS256 mit dem öffentlichen Schlüssel als HMAC-Key)
 *  3. `iss` exakt gleich `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`
 *  4. `exp` (durch jose) und optional `typ === "Bearer"`
 *     – ein ID-Token oder Refresh-Token darf hier nicht durchkommen
 *  5. `azp`/`aud` enthält `learning-platform` – Tokens, die für einen
 *     anderen Client ausgestellt wurden, sind für uns wertlos
 *     (Token-Confusion über fremde Clients desselben Realms)
 *
 * @param {Record<string,unknown>|undefined} headers
 * @returns {Promise<{ok: true, identity: object, claims: object}
 *   | {ok: false, status: number, code: string, message: string}>}
 */
export async function verifyKeycloakToken(headers) {
  const cfg = keycloakConfig();
  if (!cfg.configured) {
    // Fehlkonfiguration darf NIE als „Token ungültig“ getarnt werden,
    // sonst sucht man den Fehler an der falschen Stelle.
    return {
      ok: false,
      status: 500,
      code: "CONFIG_ERROR",
      message: "KEYCLOAK_URL ist nicht konfiguriert.",
    };
  }

  const token = readBearerToken(headers);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      message: "Authorization-Header fehlt oder ist kein gültiges Bearer-Token.",
    };
  }

  let payload;
  try {
    const result = await jwtVerify(token, remoteJwks(cfg.certsUrl), {
      issuer: cfg.issuer,
      algorithms: ["RS256"],
    });
    payload = result.payload;
  } catch (error) {
    // Nur den Fehlercode loggen – niemals Token, Header oder Claim-Werte.
    console.warn("[auth] Token-Verifikation fehlgeschlagen:", error?.code ?? error?.name ?? "unknown");
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      message: "Token konnte nicht verifiziert werden.",
    };
  }

  // Keycloak setzt `typ` auf "Bearer" für Access Tokens, auf "ID" für
  // ID-Tokens und "Refresh" für Refresh-Tokens. Fehlt der Claim, wird er
  // nicht erzwungen (andere Realm-Konfigurationen lassen ihn weg).
  if (payload.typ !== undefined && payload.typ !== "Bearer") {
    console.warn("[auth] Abgelehnt: unerwarteter typ-Claim.");
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      message: "Es wird ein Access Token (typ=Bearer) erwartet.",
    };
  }

  const audience = Array.isArray(payload.aud)
    ? payload.aud.filter((a) => typeof a === "string")
    : typeof payload.aud === "string"
      ? [payload.aud]
      : [];
  const authorizedParty = typeof payload.azp === "string" ? payload.azp : "";
  if (authorizedParty !== SPA_CLIENT_ID && !audience.includes(SPA_CLIENT_ID)) {
    console.warn("[auth] Abgelehnt: Token gehört nicht zum Client learning-platform.");
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      message: "Token wurde nicht für den Client learning-platform ausgestellt.",
    };
  }

  const subject = typeof payload.sub === "string" ? payload.sub : "";
  if (subject === "") {
    return {
      ok: false,
      status: 401,
      code: "INVALID_TOKEN",
      message: "Token enthält keinen sub-Claim.",
    };
  }

  const rawRoles = Array.isArray(payload.realm_access?.roles) ? payload.realm_access.roles : [];
  // Allowlist statt Blocklist: unbekannte Rollennamen verlassen diese Funktion nicht.
  const roles = KNOWN_REALM_ROLES.filter((role) => rawRoles.includes(role));

  const email = firstString(payload.email).trim().toLowerCase();
  const name =
    firstString(payload.name).trim() ||
    firstString(payload.preferred_username).trim() ||
    email ||
    subject;

  return {
    ok: true,
    claims: payload,
    identity: {
      sub: subject,
      email: email || null,
      name,
      roles,
      markets: parseMarkets(payload.markets),
      tenant: normalizeTenant(payload.tenant, cfg.realm),
      exp: typeof payload.exp === "number" ? payload.exp : null,
    },
  };
}

/**
 * Rollenprüfung. Bewusst als eigene, triviale Funktion: sie ist die
 * einzige Hürde zwischen einem gewöhnlichen Lernenden und dem Anlegen
 * von Benutzerkonten.
 * @param {{roles: string[]}} identity
 */
export function hasAdminRole(identity) {
  return Array.isArray(identity?.roles) && identity.roles.includes("admin");
}

// ── Service-Account-Token (Client Credentials) ───────────────────────────────
// Cache im Modul-Scope: bei warmen Function-Instanzen wird derselbe Token
// wiederverwendet, bis ~30 s vor Ablauf. Der Cache-Schlüssel enthält
// Endpunkt und Client-Credentials, damit ein Konfigurationswechsel den
// Cache invalidiert. Der Schlüssel wird NIE geloggt.
let serviceTokenCache = null;
const SERVICE_TOKEN_SAFETY_MS = 30_000;

/**
 * Holt (oder liefert aus dem Cache) das Access Token des Service-Accounts
 * `platform-backend`. Nur dieses Token darf Keycloak-Admin-Aufrufe machen –
 * das Client-Secret verlässt den Server nie.
 * @returns {Promise<{ok: true, token: string} | {ok: false, status: number, code: string, message: string}>}
 */
export async function getServiceAccountToken() {
  const cfg = keycloakConfig();
  const clientId = String(process.env.KEYCLOAK_BACKEND_CLIENT_ID ?? "").trim() || DEFAULT_BACKEND_CLIENT_ID;
  const clientSecret = String(process.env.KEYCLOAK_BACKEND_CLIENT_SECRET ?? "");

  if (!cfg.configured || clientSecret === "") {
    return {
      ok: false,
      status: 500,
      code: "CONFIG_ERROR",
      message: "KEYCLOAK_URL oder KEYCLOAK_BACKEND_CLIENT_SECRET fehlt.",
    };
  }

  const cacheKey = `${cfg.tokenUrl}|${clientId}|${clientSecret}`;
  if (
    serviceTokenCache &&
    serviceTokenCache.key === cacheKey &&
    serviceTokenCache.expiresAtMs - SERVICE_TOKEN_SAFETY_MS > Date.now()
  ) {
    return { ok: true, token: serviceTokenCache.token };
  }

  let response;
  try {
    response = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[auth] Service-Account-Token nicht erreichbar:", error?.name ?? "unknown");
    return {
      ok: false,
      status: 502,
      code: "KEYCLOAK_UNREACHABLE",
      message: "Keycloak ist nicht erreichbar.",
    };
  }

  if (!response.ok) {
    // Antwortkörper NICHT loggen – er kann Hinweise auf das Secret enthalten.
    console.error("[auth] Service-Account-Token abgelehnt, Status:", response.status);
    return {
      ok: false,
      status: 502,
      code: "KEYCLOAK_AUTH_FAILED",
      message: "Service-Account konnte sich nicht bei Keycloak anmelden.",
    };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      status: 502,
      code: "KEYCLOAK_AUTH_FAILED",
      message: "Unerwartete Antwort vom Token-Endpunkt.",
    };
  }

  const token = typeof data?.access_token === "string" ? data.access_token : "";
  if (token === "") {
    return {
      ok: false,
      status: 502,
      code: "KEYCLOAK_AUTH_FAILED",
      message: "Token-Endpunkt lieferte kein access_token.",
    };
  }

  const expiresIn = Number.isFinite(data?.expires_in) ? Number(data.expires_in) : 60;
  serviceTokenCache = {
    key: cacheKey,
    token,
    expiresAtMs: Date.now() + Math.max(expiresIn, 1) * 1000,
  };
  return { ok: true, token };
}

/**
 * Kapselt einen Aufruf der Keycloak-Admin-REST-API.
 * `pathSuffix` wird an `/admin/realms/{realm}` angehängt und muss von der
 * aufrufenden Stelle bereits kodiert sein.
 * @param {string} pathSuffix
 * @param {{method?: string, token: string, body?: unknown, query?: Record<string,string>}} options
 * @returns {Promise<Response>}
 */
export function keycloakAdminFetch(pathSuffix, { method = "GET", token, body, query } = {}) {
  const cfg = keycloakConfig();
  const url = new URL(`${cfg.adminBase}${pathSuffix}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
  });
}

/**
 * Liest die Benutzer-ID aus dem `Location`-Header einer Keycloak-201-Antwort.
 * Die ID wird streng validiert, bevor sie in weitere Admin-URLs eingesetzt
 * wird: der Header kommt von einem entfernten System, und ein Wert mit
 * `/` oder `..` könnte den Pfad der Folgeaufrufe umbiegen.
 * @param {string|null} location
 * @returns {string|null}
 */
export function userIdFromLocation(location) {
  if (typeof location !== "string" || location === "") return null;
  const cleaned = location.split("?")[0].replace(/\/+$/, "");
  const candidate = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  return /^[A-Za-z0-9._~-]{1,128}$/.test(candidate) ? candidate : null;
}
