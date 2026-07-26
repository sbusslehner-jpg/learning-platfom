// ============================================================
// POST /api/admin/invite         – Benutzer anlegen + Einladung senden
// POST /api/admin/invite/resend  – Einladung erneut senden
//
// Ablauf (auth/README.md):
//   1. Aufrufer-Token prüfen und Rolle `admin` erzwingen
//   2. Eingaben validieren (Allowlist für Rollen!)
//   3. Service-Account-Token holen (Client `platform-backend`)
//   4. Benutzer in Keycloak anlegen (enabled, emailVerified=false)
//   5. Realm-Rollen zuweisen – schlägt das fehl, wird der Benutzer wieder
//      gelöscht (kompensierende Aktion, kein halb angelegtes Konto)
//   6. execute-actions-email ["UPDATE_PASSWORD","VERIFY_EMAIL"]
//   7. app_user / user_role_assignment / user_market in Supabase spiegeln
//
// Der eingeladene Benutzer erhält KEIN Initialpasswort. Er setzt es selbst
// über den Link – damit wandert nie ein Passwort per E-Mail.
// ============================================================

import { json, parseJsonBody, requestPath } from "./_lib/http.mjs";
import {
  KNOWN_REALM_ROLES,
  SPA_CLIENT_ID,
  getServiceAccountToken,
  hasAdminRole,
  keycloakAdminFetch,
  keycloakConfig,
  normalizeTenant,
  userIdFromLocation,
  verifyKeycloakToken,
} from "./_lib/keycloak.mjs";
import {
  assignUserMarkets,
  assignUserRoles,
  resolveMarketIds,
  upsertAppUser,
} from "./_lib/supabase.mjs";

/** Gültigkeit des Einladungslinks: 3 Tage (Sekunden). */
const INVITE_LIFESPAN_SECONDS = 259_200;

/** Aktionen, die der Benutzer über den Link erledigen muss. */
const REQUIRED_ACTIONS = Object.freeze(["UPDATE_PASSWORD", "VERIFY_EMAIL"]);

/** Erlaubte Oberflächensprachen (Keycloak-Theme `groupit`). */
const ALLOWED_LOCALES = Object.freeze(["de", "en", "fr"]);

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_TENANT_LENGTH = 100;

// Pragmatische, aber strenge E-Mail-Prüfung: kein Whitespace, keine
// Steuerzeichen, genau ein @, Domain mit TLD. Bewusst restriktiver als
// RFC 5322 – exotische Adressen sind hier weniger wert als die Sicherheit,
// dass der Wert gefahrlos in Header, URLs und Filter eingesetzt werden kann.
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

// Marktcodes laut Datenmodell: 2–3 Buchstaben, großgeschrieben (market.code).
const MARKET_PATTERN = /^[A-Z]{2,3}$/;

// Steuerzeichen in Namen und Tenant ablehnen (Header-/Log-Injection).
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function isPlainString(value) {
  return typeof value === "string";
}

/**
 * Validiert und normalisiert den Einladungs-Body.
 * @param {any} body
 * @returns {{ok: true, value: object} | {ok: false, details: Array<{field: string, message: string}>}}
 */
export function validateInvitePayload(body) {
  const details = [];
  const cfg = keycloakConfig();

  // ── email ────────────────────────────────────────────────────────────────
  let email = "";
  if (!isPlainString(body?.email)) {
    details.push({ field: "email", message: "E-Mail-Adresse ist erforderlich." });
  } else {
    email = body.email.trim().toLowerCase();
    if (email === "") {
      details.push({ field: "email", message: "E-Mail-Adresse ist erforderlich." });
    } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      details.push({ field: "email", message: "E-Mail-Adresse ist ungültig." });
    }
  }

  // ── firstName / lastName ─────────────────────────────────────────────────
  const names = {};
  for (const field of ["firstName", "lastName"]) {
    if (!isPlainString(body?.[field])) {
      details.push({ field, message: "Feld ist erforderlich." });
      continue;
    }
    const value = body[field].trim();
    if (value === "") {
      details.push({ field, message: "Feld ist erforderlich." });
    } else if (value.length > MAX_NAME_LENGTH) {
      details.push({ field, message: `Maximal ${MAX_NAME_LENGTH} Zeichen.` });
    } else if (CONTROL_CHARS.test(value)) {
      details.push({ field, message: "Feld enthält unerlaubte Steuerzeichen." });
    } else {
      names[field] = value;
    }
  }

  // ── roles ────────────────────────────────────────────────────────────────
  // Strikte Allowlist. Ein Rollenname aus dem Request darf NIE ungeprüft an
  // Keycloak weitergereicht werden – sonst könnte ein Admin (oder ein
  // manipulierter Client) beliebige Realm-Rollen zuweisen, etwa
  // `realm-admin` aus einem anderen Kontext.
  let roles = [];
  if (!Array.isArray(body?.roles) || body.roles.length === 0) {
    details.push({ field: "roles", message: "Mindestens eine Rolle ist erforderlich." });
  } else {
    const invalid = body.roles.filter(
      (role) => !isPlainString(role) || !KNOWN_REALM_ROLES.includes(role),
    );
    if (invalid.length > 0) {
      details.push({
        field: "roles",
        message: `Unbekannte Rolle. Erlaubt: ${KNOWN_REALM_ROLES.join(", ")}.`,
      });
    } else {
      // Reihenfolge der Allowlist + Deduplizierung.
      roles = KNOWN_REALM_ROLES.filter((role) => body.roles.includes(role));
    }
  }

  // ── markets ──────────────────────────────────────────────────────────────
  let markets = [];
  if (body?.markets !== undefined && body?.markets !== null) {
    if (!Array.isArray(body.markets)) {
      details.push({ field: "markets", message: "Märkte müssen als Liste übergeben werden." });
    } else {
      const normalized = body.markets.map((m) => (isPlainString(m) ? m.trim().toUpperCase() : ""));
      if (normalized.some((m) => !MARKET_PATTERN.test(m))) {
        details.push({
          field: "markets",
          message: "Marktcodes bestehen aus 2–3 Buchstaben (z. B. DE, AT).",
        });
      } else {
        markets = [...new Set(normalized)];
      }
    }
  }

  // ── tenant ───────────────────────────────────────────────────────────────
  // Optional, fällt auf den Realm-Namen zurück: `tenant` ist Teil des
  // Identitätsschlüssels in app_user (issuer+tenant+subject) und darf nicht
  // NULL sein, weil NULL im Unique-Index nie kollidiert.
  let tenant = cfg.realm;
  if (body?.tenant !== undefined && body?.tenant !== null && body?.tenant !== "") {
    if (!isPlainString(body.tenant)) {
      details.push({ field: "tenant", message: "Tenant muss eine Zeichenkette sein." });
    } else {
      const value = body.tenant.trim();
      if (value.length > MAX_TENANT_LENGTH || CONTROL_CHARS.test(value)) {
        details.push({ field: "tenant", message: "Tenant ist ungültig." });
      } else if (value !== "") {
        tenant = value;
      }
    }
  }

  // ── locale ───────────────────────────────────────────────────────────────
  let locale = "de";
  if (body?.locale !== undefined && body?.locale !== null && body?.locale !== "") {
    if (!isPlainString(body.locale) || !ALLOWED_LOCALES.includes(body.locale)) {
      details.push({
        field: "locale",
        message: `Sprache muss eine von ${ALLOWED_LOCALES.join(", ")} sein.`,
      });
    } else {
      locale = body.locale;
    }
  }

  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    value: {
      email,
      firstName: names.firstName,
      lastName: names.lastName,
      roles,
      markets,
      tenant,
      locale,
    },
  };
}

/**
 * Prüft Aufrufer-Token UND Adminrolle. Gemeinsamer Eingang für beide Routen.
 * @param {any} event
 */
async function authorizeAdmin(event) {
  const verified = await verifyKeycloakToken(event?.headers);
  if (!verified.ok) {
    return { ok: false, response: json(verified.status, { code: verified.code, message: verified.message }) };
  }
  if (!hasAdminRole(verified.identity)) {
    // Genau diese Zeile trennt einen Lernenden von der Benutzerverwaltung.
    console.warn("[admin-invite] Abgelehnt: Aufrufer hat keine Adminrolle.");
    return {
      ok: false,
      response: json(403, {
        code: "FORBIDDEN",
        message: "Für diese Aktion ist die Rolle admin erforderlich.",
      }),
    };
  }
  return { ok: true, identity: verified.identity };
}

/**
 * Baut die Query für execute-actions-email.
 * `redirect_uri` kommt ausschließlich aus der Serverkonfiguration
 * (PLATFORM_URL) – niemals aus dem Request. Ein vom Client gesteuerter
 * Redirect wäre ein offener Weiterleitungs-/Phishing-Vektor im
 * Einladungslink.
 */
function executeActionsQuery() {
  const platformUrl = String(process.env.PLATFORM_URL ?? "").trim();
  return {
    client_id: SPA_CLIENT_ID,
    ...(platformUrl === "" ? {} : { redirect_uri: platformUrl }),
    lifespan: String(INVITE_LIFESPAN_SECONDS),
  };
}

/**
 * Sendet die Einladungs-E-Mail (Keycloak versendet, Theme `groupit`).
 * @returns {Promise<boolean>} true, wenn Keycloak den Versand bestätigt hat.
 */
async function sendInvitationEmail(userId, token) {
  try {
    const response = await keycloakAdminFetch(
      `/users/${encodeURIComponent(userId)}/execute-actions-email`,
      { method: "PUT", token, body: REQUIRED_ACTIONS, query: executeActionsQuery() },
    );
    if (!response.ok) {
      console.warn("[admin-invite] E-Mail-Versand abgelehnt, Status:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[admin-invite] E-Mail-Versand fehlgeschlagen:", error?.name ?? "unknown");
    return false;
  }
}

/**
 * Kompensierende Aktion: löscht einen gerade angelegten Benutzer wieder.
 * Wird nur bei Fehlern VOR dem E-Mail-Versand aufgerufen, damit kein halb
 * provisioniertes Konto (ohne Rollen) im Realm zurückbleibt.
 */
async function deleteKeycloakUser(userId, token) {
  try {
    const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      token,
    });
    if (!response.ok) {
      console.error("[admin-invite] Rücknahme des Benutzers fehlgeschlagen, Status:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[admin-invite] Rücknahme des Benutzers fehlgeschlagen:", error?.name ?? "unknown");
    return false;
  }
}

/**
 * Spiegelt den neuen Benutzer nach Supabase. Fehler sind NICHT fatal –
 * das Keycloak-Konto existiert und die Einladung ist unterwegs; die
 * Spiegelung kann nachgezogen werden (beim ersten /api/auth/exchange
 * entsteht die app_user-Zeile ohnehin).
 * @returns {Promise<{provisioned: boolean, note: string|null}>}
 */
async function mirrorToSupabase({ userId, email, firstName, lastName, roles, markets, tenant }) {
  const upsert = await upsertAppUser({
    issuer: "keycloak",
    tenant,
    subject: userId,
    name: `${firstName} ${lastName}`.trim(),
    email,
    // Neues Konto: ausdrücklich aktiv (Migration 0004).
    active: true,
  });
  if (!upsert.ok) {
    return { provisioned: false, note: "Benutzerprofil in der Datenbank konnte nicht angelegt werden." };
  }

  const notes = [];
  const roleResult = await assignUserRoles(upsert.id, roles);
  if (!roleResult.ok) notes.push("Rollen wurden in der Datenbank nicht gespeichert.");

  if (markets.length > 0) {
    const resolved = await resolveMarketIds(markets);
    if (!resolved.ok) {
      notes.push("Märkte konnten in der Datenbank nicht aufgelöst werden.");
    } else {
      if (resolved.unknown.length > 0) {
        notes.push(`Unbekannte Marktcodes: ${resolved.unknown.join(", ")}.`);
      }
      if (resolved.ids.length > 0) {
        const marketResult = await assignUserMarkets(upsert.id, resolved.ids);
        if (!marketResult.ok) notes.push("Märkte wurden in der Datenbank nicht gespeichert.");
      }
    }
  }

  return notes.length === 0
    ? { provisioned: true, note: null }
    : { provisioned: false, note: notes.join(" ") };
}

// ── Route: Einladung erneut senden ───────────────────────────────────────────
async function handleResend(event) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return json(400, {
      code: "INVALID_INPUT",
      message: "Ungültiger Request-Body.",
      details: [{ field: "body", message: "JSON-Objekt erwartet." }],
    });
  }

  const rawEmail = isPlainString(parsed.value.email) ? parsed.value.email.trim().toLowerCase() : "";
  if (rawEmail === "" || rawEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(rawEmail)) {
    return json(400, {
      code: "INVALID_INPUT",
      message: "Ungültige Eingabe.",
      details: [{ field: "email", message: "E-Mail-Adresse ist ungültig." }],
    });
  }

  const service = await getServiceAccountToken();
  if (!service.ok) {
    return json(service.status, { code: service.code, message: service.message });
  }

  let lookup;
  try {
    lookup = await keycloakAdminFetch("/users", {
      token: service.token,
      // `exact=true` verhindert, dass eine Teilzeichenkette einen fremden
      // Benutzer trifft und dieser eine Passwort-Zurücksetzen-Mail erhält.
      query: { email: rawEmail, exact: "true" },
    });
  } catch (error) {
    console.error("[admin-invite] Benutzersuche fehlgeschlagen:", error?.name ?? "unknown");
    return json(502, { code: "KEYCLOAK_UNREACHABLE", message: "Keycloak ist nicht erreichbar." });
  }

  if (!lookup.ok) {
    console.error("[admin-invite] Benutzersuche abgelehnt, Status:", lookup.status);
    return json(502, { code: "KEYCLOAK_ERROR", message: "Benutzer konnte nicht gesucht werden." });
  }

  const users = await lookup.json().catch(() => null);
  const user = Array.isArray(users) ? users[0] : null;
  const userId = isPlainString(user?.id) ? user.id : null;
  if (!userId) {
    return json(404, { code: "USER_NOT_FOUND", message: "Zu dieser E-Mail-Adresse existiert kein Konto." });
  }

  const emailSent = await sendInvitationEmail(userId, service.token);
  return json(200, {
    userId,
    emailSent,
    message: emailSent
      ? "Einladung wurde erneut versendet."
      : "Einladung konnte nicht versendet werden. Bitte später erneut versuchen.",
  });
}

// ── Route: Benutzer anlegen + einladen ───────────────────────────────────────
async function handleInvite(event) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return json(400, {
      code: "INVALID_INPUT",
      message: "Ungültiger Request-Body.",
      details: [{ field: "body", message: "JSON-Objekt erwartet." }],
    });
  }

  // Validierung VOR jedem ausgehenden Aufruf: ungültige Eingaben erzeugen
  // keinerlei Seiteneffekt in Keycloak.
  const validation = validateInvitePayload(parsed.value);
  if (!validation.ok) {
    return json(400, {
      code: "INVALID_INPUT",
      message: "Ungültige Eingabe.",
      details: validation.details,
    });
  }
  const input = validation.value;

  const service = await getServiceAccountToken();
  if (!service.ok) {
    return json(service.status, { code: service.code, message: service.message });
  }

  // ── Benutzer anlegen ─────────────────────────────────────────────────────
  // Kein `credentials`-Feld: es wird bewusst kein Initialpasswort gesetzt.
  let createResponse;
  try {
    createResponse = await keycloakAdminFetch("/users", {
      method: "POST",
      token: service.token,
      body: {
        username: input.email,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        // false: erst der Klick auf VERIFY_EMAIL bestätigt die Adresse.
        emailVerified: false,
        attributes: {
          markets: [input.markets.join(",")],
          tenant: [normalizeTenant(input.tenant, keycloakConfig().realm)],
          locale: [input.locale],
        },
      },
    });
  } catch (error) {
    console.error("[admin-invite] Benutzeranlage fehlgeschlagen:", error?.name ?? "unknown");
    return json(502, { code: "KEYCLOAK_UNREACHABLE", message: "Keycloak ist nicht erreichbar." });
  }

  if (createResponse.status === 409) {
    return json(409, {
      code: "USER_EXISTS",
      message: "Zu dieser E-Mail-Adresse existiert bereits ein Konto. Einladung ggf. erneut senden.",
    });
  }
  if (!createResponse.ok) {
    console.error("[admin-invite] Benutzeranlage abgelehnt, Status:", createResponse.status);
    return json(502, { code: "KEYCLOAK_ERROR", message: "Benutzer konnte nicht angelegt werden." });
  }

  const userId = userIdFromLocation(createResponse.headers.get("location"));
  if (!userId) {
    console.error("[admin-invite] Keycloak lieferte keine verwertbare Benutzer-ID.");
    return json(502, {
      code: "KEYCLOAK_ERROR",
      message: "Benutzer wurde angelegt, die ID konnte aber nicht gelesen werden.",
    });
  }

  // ── Realm-Rollen zuweisen ────────────────────────────────────────────────
  // `input.roles` ist bereits allowlist-geprüft; die Rollennamen werden
  // zusätzlich URL-kodiert.
  let roleRepresentations;
  try {
    const fetched = await Promise.all(
      input.roles.map(async (role) => {
        const response = await keycloakAdminFetch(`/roles/${encodeURIComponent(role)}`, {
          token: service.token,
        });
        if (!response.ok) return null;
        const representation = await response.json().catch(() => null);
        if (!representation || !isPlainString(representation.id) || representation.name !== role) {
          return null;
        }
        return { id: representation.id, name: representation.name };
      }),
    );
    roleRepresentations = fetched.every((r) => r !== null) ? fetched : null;
  } catch (error) {
    console.error("[admin-invite] Rollenabruf fehlgeschlagen:", error?.name ?? "unknown");
    roleRepresentations = null;
  }

  let rolesAssigned = false;
  if (roleRepresentations) {
    try {
      const mapping = await keycloakAdminFetch(
        `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        { method: "POST", token: service.token, body: roleRepresentations },
      );
      rolesAssigned = mapping.ok;
      if (!mapping.ok) {
        console.error("[admin-invite] Rollenzuweisung abgelehnt, Status:", mapping.status);
      }
    } catch (error) {
      console.error("[admin-invite] Rollenzuweisung fehlgeschlagen:", error?.name ?? "unknown");
    }
  }

  if (!rolesAssigned) {
    // Kompensieren: ein Konto ohne Rollen wäre ein stiller Fehlzustand –
    // der Benutzer könnte sich anmelden, hätte aber keine Berechtigungen,
    // und ein erneuter Einladungsversuch würde an 409 scheitern.
    const rolledBack = await deleteKeycloakUser(userId, service.token);
    return json(500, {
      code: "ROLE_ASSIGNMENT_FAILED",
      rolledBack,
      message: rolledBack
        ? "Rollen konnten nicht zugewiesen werden. Das Konto wurde wieder entfernt – bitte erneut einladen."
        : "Rollen konnten nicht zugewiesen werden und das Konto konnte nicht entfernt werden. Bitte in Keycloak prüfen.",
    });
  }

  // ── Einladung versenden ─────────────────────────────────────────────────
  // Schlägt nur der Versand fehl, bleibt das Konto bestehen: es ist
  // vollständig und korrekt provisioniert, die Mail kann nachgesendet werden.
  const emailSent = await sendInvitationEmail(userId, service.token);

  // ── Nach Supabase spiegeln (nicht fatal) ────────────────────────────────
  const mirror = await mirrorToSupabase({
    userId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    roles: input.roles,
    markets: input.markets,
    tenant: input.tenant,
  });

  const messages = [
    emailSent
      ? "Benutzer angelegt, Einladung versendet."
      : "Benutzer angelegt, aber die Einladungs-E-Mail konnte nicht versendet werden – Einladung erneut senden über /api/admin/invite/resend.",
  ];
  if (mirror.note) messages.push(mirror.note);

  return json(201, {
    userId,
    emailSent,
    provisioned: mirror.provisioned,
    message: messages.join(" "),
  });
}

export const handler = async (event) => {
  if (String(event?.httpMethod ?? "").toUpperCase() !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Nur POST ist erlaubt." }, { Allow: "POST" });
  }

  // Autorisierung als Erstes – vor Body-Parsing und vor jedem
  // ausgehenden Aufruf. Ein Nicht-Admin erfährt so nichts über die
  // Validierungsregeln oder den Zustand des Realms.
  const auth = await authorizeAdmin(event);
  if (!auth.ok) return auth.response;

  const path = requestPath(event).replace(/\/+$/, "");
  if (path.endsWith("/resend")) return handleResend(event);
  return handleInvite(event);
};
