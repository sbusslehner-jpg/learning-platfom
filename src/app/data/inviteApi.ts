import { getAccessToken, KEYCLOAK_MODE } from "./keycloakAuth";

// ============================================================
// Client für die serverseitigen Einladungs-Endpunkte
// (netlify/functions/admin-invite.mjs, Vertrag: auth/README.md).
//
// Die Keycloak-Admin-Zugangsdaten liegen ausschließlich serverseitig. Die
// Oberfläche schickt nur das eigene Zugriffstoken mit; die Funktion prüft
// daraus die Administratorrolle, legt den Benutzer an und lässt Keycloak die
// gestaltete Einladungs-E-Mail versenden.
// ============================================================

export type InviteInput = {
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];      // "admin" | "editor" | "user"
  markets: string[];    // Marktcodes, z. B. ["DE","AT"]
  tenant?: string;
  locale?: string;      // "de" | "en" | "fr"
};

export type InviteResult = {
  ok: boolean;
  /** Konto in Keycloak angelegt und E-Mail zugestellt? */
  emailSent?: boolean;
  /** Spiegelung in der Plattform-Datenbank erfolgreich? */
  provisioned?: boolean;
  /** Für die Oberfläche aufbereitete Meldung. */
  message: string;
  /** Feldbezogene Fehler bei Eingabeproblemen (HTTP 400). */
  fieldErrors?: string[];
};

/** Steht der serverseitige Einladungsweg zur Verfügung? */
export const INVITE_AVAILABLE = KEYCLOAK_MODE;

async function authorizedFetch(path: string, body: unknown): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("no-token");
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

/** Legt ein Konto in Keycloak an und löst die Einladungs-E-Mail aus. */
export async function inviteUser(input: InviteInput): Promise<InviteResult> {
  if (!INVITE_AVAILABLE) {
    return { ok: false, message: "Einladungen benötigen eine aktive Keycloak-Anbindung." };
  }
  try {
    const res = await authorizedFetch("/api/admin/invite", input);
    const data = await res.json().catch(() => ({}));

    if (res.status === 201) {
      return {
        ok: true,
        emailSent: data.emailSent !== false,
        provisioned: data.provisioned !== false,
        message: data.emailSent === false
          ? "Konto angelegt, aber die Einladung konnte nicht versendet werden. Bitte erneut senden."
          : `Einladung an ${input.email} versendet.`,
      };
    }
    if (res.status === 400) {
      return { ok: false, message: "Bitte Eingaben prüfen.", fieldErrors: data.details ?? [] };
    }
    if (res.status === 403) {
      return { ok: false, message: "Keine Berechtigung: nur Administratoren dürfen einladen." };
    }
    if (res.status === 409) {
      return { ok: false, message: "Für diese E-Mail-Adresse existiert bereits ein Konto." };
    }
    return { ok: false, message: data.message ?? "Einladung fehlgeschlagen." };
  } catch (err) {
    if (String(err).includes("no-token")) {
      return { ok: false, message: "Sitzung abgelaufen. Bitte erneut anmelden." };
    }
    return { ok: false, message: "Server nicht erreichbar." };
  }
}

/** Sendet eine bestehende Einladung erneut (z. B. wenn der Link abgelaufen ist). */
export async function resendInvite(email: string): Promise<InviteResult> {
  if (!INVITE_AVAILABLE) {
    return { ok: false, message: "Einladungen benötigen eine aktive Keycloak-Anbindung." };
  }
  try {
    const res = await authorizedFetch("/api/admin/invite/resend", { email });
    if (res.ok) return { ok: true, emailSent: true, message: `Einladung an ${email} erneut versendet.` };
    if (res.status === 404) return { ok: false, message: "Kein Konto zu dieser E-Mail-Adresse gefunden." };
    if (res.status === 403) return { ok: false, message: "Keine Berechtigung." };
    return { ok: false, message: "Erneutes Senden fehlgeschlagen." };
  } catch {
    return { ok: false, message: "Server nicht erreichbar." };
  }
}
