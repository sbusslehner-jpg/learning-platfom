// ============================================================
// GET  /api/admin/smtp        – aktuelle Mail-Einstellungen lesen
// PUT  /api/admin/smtp        – Mail-Einstellungen speichern
// POST /api/admin/smtp/test   – Testnachricht an den Aufrufer senden
//
// Zweck: Administratoren sollen den Mailversand in der Plattform einstellen
// können, ohne Zugang zur Keycloak-Konsole oder zum Server zu brauchen.
// Keycloak verschickt die Einladungen, also liegt die Einstellung dort –
// diese Funktion ist die einzige Brücke dorthin.
//
// Zwei Dinge sind hier sicherheitsrelevant und bewusst gelöst:
//
//  1. Das SMTP-Passwort verlässt den Server NIE. `GET` liefert nur, ob eines
//     hinterlegt ist (`passwordSet`), niemals den Wert. Wer speichert, ohne ein
//     neues Passwort anzugeben, behält das bestehende.
//  2. Die Zieladresse des Tests kommt aus dem geprüften Token des Aufrufers,
//     nicht aus dem Request. Sonst wäre der Endpunkt ein Versandwerkzeug für
//     beliebige Adressen über euren Mailserver.
//
// Vertrag: auth/README.md
// ============================================================

import { json, parseJsonBody, requestPath } from "./_lib/http.mjs";
import {
  getServiceAccountToken,
  hasAdminRole,
  keycloakAdminFetch,
  verifyKeycloakToken,
} from "./_lib/keycloak.mjs";
import { allow, audit, tooManyRequests } from "./_lib/guard.mjs";

const MAX_TEXT = 200;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Verschlüsselung: genau eine Variante, nicht beide gleichzeitig. */
const ENCRYPTIONS = Object.freeze(["none", "starttls", "ssl"]);

function isPlainString(value) {
  return typeof value === "string";
}

/**
 * Prüft Aufrufer-Token UND Adminrolle – gemeinsamer Eingang aller Routen.
 * Bewusst identisch zu admin-invite: Wer den Mailversand umstellen kann,
 * kann Einladungen umleiten. Das ist dieselbe Vertrauensstufe.
 */
async function authorizeAdmin(event) {
  const verified = await verifyKeycloakToken(event?.headers);
  if (!verified.ok) {
    return { ok: false, response: json(verified.status, { code: verified.code, message: verified.message }) };
  }
  if (!hasAdminRole(verified.identity)) {
    console.warn("[admin-smtp] Abgelehnt: Aufrufer hat keine Adminrolle.");
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
 * Validiert die Eingaben. Bewusst streng: Die Werte landen in der
 * Realm-Konfiguration und werden von Keycloak in SMTP-Dialoge eingesetzt –
 * Steuerzeichen hätten dort nichts zu suchen.
 */
export function validateSmtpPayload(body) {
  const details = [];
  const out = {};

  // ── host ─────────────────────────────────────────────────────────────────
  if (!isPlainString(body?.host) || body.host.trim() === "") {
    details.push({ field: "host", message: "Server-Adresse ist erforderlich." });
  } else {
    const host = body.host.trim();
    if (host.length > MAX_TEXT || CONTROL_CHARS.test(host) || /\s/.test(host)) {
      details.push({ field: "host", message: "Server-Adresse ist ungültig." });
    } else {
      out.host = host;
    }
  }

  // ── port ─────────────────────────────────────────────────────────────────
  const portRaw = body?.port;
  const port = typeof portRaw === "number" ? portRaw : Number.parseInt(String(portRaw ?? ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    details.push({ field: "port", message: "Port muss zwischen 1 und 65535 liegen." });
  } else {
    out.port = String(port);
  }

  // ── from ─────────────────────────────────────────────────────────────────
  // Absenderadresse muss vorhanden sein: Ohne sie weist praktisch jeder
  // Mailserver die Nachricht ab, und Keycloak meldet das nur unspezifisch.
  if (!isPlainString(body?.from) || body.from.trim() === "") {
    details.push({ field: "from", message: "Absenderadresse ist erforderlich." });
  } else {
    const from = body.from.trim().toLowerCase();
    if (from.length > MAX_TEXT || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(from)) {
      details.push({ field: "from", message: "Absenderadresse ist ungültig." });
    } else {
      out.from = from;
    }
  }

  // ── optionale Textfelder ─────────────────────────────────────────────────
  for (const field of ["fromDisplayName", "replyTo", "replyToDisplayName", "envelopeFrom"]) {
    const value = body?.[field];
    if (value === undefined || value === null || value === "") continue;
    if (!isPlainString(value) || value.length > MAX_TEXT || CONTROL_CHARS.test(value)) {
      details.push({ field, message: "Wert ist ungültig." });
    } else {
      out[field] = value.trim();
    }
  }

  // ── Verschlüsselung ──────────────────────────────────────────────────────
  const encryption = body?.encryption ?? "starttls";
  if (!ENCRYPTIONS.includes(encryption)) {
    details.push({ field: "encryption", message: `Erlaubt: ${ENCRYPTIONS.join(", ")}.` });
  } else {
    out.encryption = encryption;
  }

  // ── Authentifizierung ────────────────────────────────────────────────────
  const auth = body?.auth === true;
  out.auth = auth;
  if (auth) {
    if (!isPlainString(body?.user) || body.user.trim() === "") {
      details.push({ field: "user", message: "Benutzername ist erforderlich, wenn Authentifizierung aktiv ist." });
    } else if (body.user.length > MAX_TEXT || CONTROL_CHARS.test(body.user)) {
      details.push({ field: "user", message: "Benutzername ist ungültig." });
    } else {
      out.user = body.user.trim();
    }
    // Passwort ist optional: fehlt es, bleibt das gespeicherte bestehen.
    if (body?.password !== undefined && body?.password !== null && body.password !== "") {
      if (!isPlainString(body.password) || body.password.length > MAX_TEXT || CONTROL_CHARS.test(body.password)) {
        details.push({ field: "password", message: "Passwort ist ungültig." });
      } else {
        out.password = body.password;
      }
    }
  }

  if (details.length > 0) return { ok: false, details };
  return { ok: true, value: out };
}

/**
 * Übersetzt die Eingaben in Keycloaks `smtpServer`-Darstellung.
 * Keycloak erwartet dort ausschließlich Zeichenketten – auch für Wahrheitswerte.
 * @param {object} input Ergebnis von validateSmtpPayload
 * @param {object} existing bisher gespeicherter smtpServer-Block
 */
export function toKeycloakSmtp(input, existing = {}) {
  const smtp = {
    host: input.host,
    port: input.port,
    from: input.from,
    // Ohne eigenen Anzeigenamen bzw. Antwortadresse auf den Absender
    // zurückfallen – sonst bliebe ein alter Wert aus der Vorlage stehen.
    fromDisplayName: input.fromDisplayName ?? existing.fromDisplayName ?? "",
    envelopeFrom: input.envelopeFrom ?? input.from,
    replyTo: input.replyTo ?? input.from,
    replyToDisplayName: input.replyToDisplayName ?? existing.replyToDisplayName ?? "",
    starttls: String(input.encryption === "starttls"),
    ssl: String(input.encryption === "ssl"),
    auth: String(input.auth),
  };

  if (input.auth) {
    smtp.user = input.user;
    // Kein neues Passwort übergeben → bestehendes behalten. So kann ein
    // Administrator den Port ändern, ohne das Passwort erneut einzutippen.
    const password = input.password ?? existing.password;
    if (password !== undefined) smtp.password = password;
  }

  return smtp;
}

/** Liest die Realm-Darstellung. */
async function fetchRealm(token) {
  const response = await keycloakAdminFetch("", { token });
  if (!response.ok) return { ok: false, status: response.status };
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") return { ok: false, status: 502 };
  return { ok: true, realm: data };
}

// ── Route: lesen ─────────────────────────────────────────────────────────────
async function handleGet(service) {
  const realm = await fetchRealm(service.token);
  if (!realm.ok) {
    console.error("[admin-smtp] Realm nicht lesbar, Status:", realm.status);
    return json(502, { code: "KEYCLOAK_ERROR", message: "Einstellungen konnten nicht gelesen werden." });
  }

  const smtp = realm.realm.smtpServer ?? {};
  const encryption = smtp.ssl === "true" ? "ssl" : smtp.starttls === "true" ? "starttls" : "none";

  return json(200, {
    host: smtp.host ?? "",
    port: smtp.port ?? "587",
    from: smtp.from ?? "",
    fromDisplayName: smtp.fromDisplayName ?? "",
    replyTo: smtp.replyTo ?? "",
    encryption,
    auth: smtp.auth === "true",
    user: smtp.user ?? "",
    // Nur die Tatsache, nie der Wert.
    passwordSet: typeof smtp.password === "string" && smtp.password !== "",
    // Damit die Oberfläche den Zustand „noch nie eingerichtet" erklären kann.
    configured: typeof smtp.host === "string" && smtp.host !== "" && smtp.host !== "mailpit",
  });
}

// ── Route: speichern ─────────────────────────────────────────────────────────
async function handlePut(event, service, actor) {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return json(400, {
      code: "INVALID_INPUT",
      message: "Ungültiger Request-Body.",
      details: [{ field: "body", message: "JSON-Objekt erwartet." }],
    });
  }

  const validation = validateSmtpPayload(parsed.value);
  if (!validation.ok) {
    return json(400, { code: "INVALID_INPUT", message: "Ungültige Eingabe.", details: validation.details });
  }

  // Vollständige Darstellung holen und nur den SMTP-Block ersetzen. Eine
  // Teilaktualisierung wäre kürzer, aber Keycloak überschreibt dabei je nach
  // Version stillschweigend weitere Felder – das Risiko ist es nicht wert.
  const current = await fetchRealm(service.token);
  if (!current.ok) {
    console.error("[admin-smtp] Realm nicht lesbar, Status:", current.status);
    return json(502, { code: "KEYCLOAK_ERROR", message: "Einstellungen konnten nicht gelesen werden." });
  }

  const smtp = toKeycloakSmtp(validation.value, current.realm.smtpServer ?? {});

  let response;
  try {
    response = await keycloakAdminFetch("", {
      method: "PUT",
      token: service.token,
      body: { ...current.realm, smtpServer: smtp },
    });
  } catch (error) {
    console.error("[admin-smtp] Speichern fehlgeschlagen:", error?.name ?? "unknown");
    return json(502, { code: "KEYCLOAK_UNREACHABLE", message: "Keycloak ist nicht erreichbar." });
  }

  if (!response.ok) {
    // 403 hat genau eine wahrscheinliche Ursache – die soll man nicht suchen müssen.
    if (response.status === 403) {
      console.error("[admin-smtp] Keycloak verweigert das Schreiben (manage-realm fehlt?).");
      return json(502, {
        code: "KEYCLOAK_FORBIDDEN",
        message:
          "Keycloak verweigert die Änderung. Dem Service-Account des Clients " +
          "platform-backend fehlt vermutlich die Rolle manage-realm.",
      });
    }
    console.error("[admin-smtp] Speichern abgelehnt, Status:", response.status);
    return json(502, { code: "KEYCLOAK_ERROR", message: "Einstellungen konnten nicht gespeichert werden." });
  }

  void audit({
    identity: actor,
    action: "smtp.updated",
    targetType: "realm",
    targetId: "serviceq",
    // Bewusst ohne Passwort und ohne Benutzernamen: Das Protokoll soll
    // nachvollziehbar machen, WER WANN den Mailweg geaendert hat - nicht die
    // Zugangsdaten aufbewahren.
    detail: { host: smtp.host, port: smtp.port, from: smtp.from, auth: smtp.auth },
  });
  return json(200, { message: "Mail-Einstellungen gespeichert." });
}

// ── Route: Verbindung testen ─────────────────────────────────────────────────
async function handleTest(event, service, identity) {
  // Empfänger ist der angemeldete Administrator – nicht verhandelbar.
  // Käme die Adresse aus dem Request, wäre dies ein offener Mailversender.
  if (!identity.email) {
    return json(400, {
      code: "NO_RECIPIENT",
      message: "Für den Test braucht Ihr Konto eine hinterlegte E-Mail-Adresse.",
    });
  }

  const parsed = parseJsonBody(event);
  // Der Test läuft gegen die übergebenen Werte, damit man vor dem Speichern
  // prüfen kann. Ohne Body wird die gespeicherte Konfiguration getestet.
  let smtp;
  if (parsed.ok && Object.keys(parsed.value).length > 0) {
    const validation = validateSmtpPayload(parsed.value);
    if (!validation.ok) {
      return json(400, { code: "INVALID_INPUT", message: "Ungültige Eingabe.", details: validation.details });
    }
    const current = await fetchRealm(service.token);
    smtp = toKeycloakSmtp(validation.value, current.ok ? current.realm.smtpServer ?? {} : {});
  } else {
    const current = await fetchRealm(service.token);
    if (!current.ok) {
      return json(502, { code: "KEYCLOAK_ERROR", message: "Einstellungen konnten nicht gelesen werden." });
    }
    smtp = current.realm.smtpServer ?? {};
  }

  let response;
  try {
    response = await keycloakAdminFetch("/testSMTPConnection", {
      method: "POST",
      token: service.token,
      body: { ...smtp, replyTo: smtp.replyTo ?? "", envelopeFrom: smtp.envelopeFrom ?? "" },
    });
  } catch (error) {
    console.error("[admin-smtp] Verbindungstest fehlgeschlagen:", error?.name ?? "unknown");
    return json(502, { code: "KEYCLOAK_UNREACHABLE", message: "Keycloak ist nicht erreichbar." });
  }

  if (!response.ok) {
    // Keycloak liefert hier eine sprechende Fehlermeldung des Mailservers.
    const body = await response.text().catch(() => "");
    let detail = "";
    try {
      detail = JSON.parse(body)?.errorMessage ?? "";
    } catch {
      detail = "";
    }
    console.warn("[admin-smtp] Testversand abgelehnt, Status:", response.status);
    return json(400, {
      code: "SMTP_TEST_FAILED",
      message: detail
        ? `Testversand fehlgeschlagen: ${String(detail).slice(0, 200)}`
        : "Testversand fehlgeschlagen. Bitte Server, Port und Zugangsdaten prüfen.",
    });
  }

  return json(200, { message: `Testnachricht an ${identity.email} versendet.` });
}

export const handler = async (event) => {
  const method = String(event?.httpMethod ?? "").toUpperCase();
  if (!["GET", "PUT", "POST"].includes(method)) {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Erlaubt sind GET, PUT und POST." }, { Allow: "GET, PUT, POST" });
  }

  // Autorisierung als Erstes – vor Body-Parsing und vor jedem ausgehenden Aufruf.
  const auth = await authorizeAdmin(event);
  if (!auth.ok) return auth.response;

  const service = await getServiceAccountToken();
  if (!service.ok) {
    return json(service.status, { code: service.code, message: service.message });
  }

  const path = requestPath(event).replace(/\/+$/, "");
  if (method === "POST") {
    // R-13: Der Testversand schickt echte Nachrichten ueber euren Mailserver.
    // Zehn Versuche je Stunde reichen zum Einrichten; alles darueber ist kein
    // Einrichten mehr.
    if (!(await allow(`smtp-test:${auth.identity.sub}`, 10, 3600))) {
      console.warn("[admin-smtp] Rate-Limit erreicht.");
      return tooManyRequests(3600);
    }
    if (!path.endsWith("/test")) {
      return json(404, { code: "NOT_FOUND", message: "Unbekannte Route." });
    }
    return handleTest(event, service, auth.identity);
  }
  if (method === "PUT") return handlePut(event, service, auth.identity);
  return handleGet(service);
};
