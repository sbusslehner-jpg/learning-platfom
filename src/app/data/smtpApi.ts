import { getAccessToken, KEYCLOAK_MODE } from "./keycloakAuth";

// ============================================================
// Client für die serverseitigen Mail-Einstellungen
// (netlify/functions/admin-smtp.mjs).
//
// Der Mailversand hängt an Keycloak – dort liegen die Einladungsvorlagen und
// von dort geht die Nachricht raus. Diese Oberfläche schreibt die Einstellung
// also nicht in die Plattform-Datenbank, sondern über die Funktion in den
// Realm. Die Keycloak-Zugangsdaten bleiben dabei serverseitig; mitgeschickt
// wird nur das eigene Zugriffstoken, aus dem die Funktion die Adminrolle prüft.
//
// Das Passwort kommt nie zurück: Der Server liefert lediglich `passwordSet`.
// Wer speichert, ohne ein neues einzugeben, behält das hinterlegte.
// ============================================================

export type SmtpSettings = {
  host: string;
  port: string;
  from: string;
  fromDisplayName: string;
  replyTo: string;
  encryption: "none" | "starttls" | "ssl";
  auth: boolean;
  user: string;
  /** Nur die Tatsache, nie der Wert. */
  passwordSet: boolean;
  /** false, solange noch der Entwicklungsstand (mailpit) hinterlegt ist. */
  configured: boolean;
};

export type SmtpInput = Omit<SmtpSettings, "passwordSet" | "configured"> & {
  /** Leer lassen, um das gespeicherte Passwort zu behalten. */
  password?: string;
};

export type SmtpResult = {
  ok: boolean;
  message: string;
  fieldErrors?: string[];
};

/** Steht der serverseitige Weg zur Verfügung? Ohne Keycloak-Modus nein. */
export const SMTP_AVAILABLE = KEYCLOAK_MODE;

async function authorized(path: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("no-token");
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Fasst Feldfehler der Funktion für die Oberfläche zusammen. */
function fieldErrorsFrom(payload: any): string[] | undefined {
  if (!Array.isArray(payload?.details)) return undefined;
  const list = payload.details
    .map((d: any) => (d?.field && d?.message ? `${d.field}: ${d.message}` : d?.message))
    .filter((m: unknown): m is string => typeof m === "string");
  return list.length > 0 ? list : undefined;
}

export async function fetchSmtpSettings(): Promise<SmtpSettings | null> {
  if (!SMTP_AVAILABLE) return null;
  try {
    const response = await authorized("/api/admin/smtp", { method: "GET" });
    if (!response.ok) return null;
    return (await response.json()) as SmtpSettings;
  } catch {
    return null;
  }
}

export async function saveSmtpSettings(input: SmtpInput): Promise<SmtpResult> {
  if (!SMTP_AVAILABLE) {
    return { ok: false, message: "Ohne Keycloak-Anbindung nicht verfügbar." };
  }
  let response: Response;
  try {
    response = await authorized("/api/admin/smtp", { method: "PUT", body: JSON.stringify(input) });
  } catch {
    return { ok: false, message: "Server nicht erreichbar." };
  }
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    message: payload?.message ?? (response.ok ? "Gespeichert." : "Speichern fehlgeschlagen."),
    fieldErrors: fieldErrorsFrom(payload),
  };
}

/**
 * Schickt eine Testnachricht. Empfänger ist immer das eigene Konto – die
 * Adresse bestimmt der Server aus dem Token, nicht die Oberfläche.
 */
export async function testSmtpSettings(input: SmtpInput): Promise<SmtpResult> {
  if (!SMTP_AVAILABLE) {
    return { ok: false, message: "Ohne Keycloak-Anbindung nicht verfügbar." };
  }
  let response: Response;
  try {
    response = await authorized("/api/admin/smtp/test", { method: "POST", body: JSON.stringify(input) });
  } catch {
    return { ok: false, message: "Server nicht erreichbar." };
  }
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    message: payload?.message ?? (response.ok ? "Testnachricht versendet." : "Testversand fehlgeschlagen."),
    fieldErrors: fieldErrorsFrom(payload),
  };
}
