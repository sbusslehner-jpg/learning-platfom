import { getAccessToken, KEYCLOAK_MODE } from "./keycloakAuth";

// ─── Benachrichtigungen (R-09) ────────────────────────────────────────────────
//
// Die Warteschlange liegt in der Datenbank, der Versand in einer
// Serverfunktion. Der Browser fragt nur nach Kennzahlen und kann einen Lauf
// anstoßen – Empfänger und Inhalt entstehen dort, wo auch die
// Sichtbarkeitsregel steht.

export interface NotifyStatus {
  pending: number;
  sent: number;
  dead: number;
  oldestPending: string | null;
  /** Ohne Postausgang wartet die Schlange, statt zu scheitern. */
  smtpConfigured: boolean;
}

export interface NotifyRunResult {
  ok: boolean;
  sent: number;
  failed: number;
  message: string;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  if (!KEYCLOAK_MODE) return null;
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/**
 * Kennzahlen der Warteschlange.
 *
 * `null` heißt „nicht abrufbar" und ist etwas anderes als „nichts in der
 * Warteschlange". Beides gleich darzustellen würde einen Ausfall wie Ordnung
 * aussehen lassen.
 */
export async function fetchNotifyStatus(): Promise<NotifyStatus | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const response = await fetch("/api/notify/status", { headers });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      pending: Number(data?.pending ?? 0),
      sent: Number(data?.sent ?? 0),
      dead: Number(data?.dead ?? 0),
      oldestPending: data?.oldestPending ?? null,
      smtpConfigured: data?.smtpConfigured === true,
    };
  } catch {
    return null;
  }
}

export async function runNotifyWorker(): Promise<NotifyRunResult> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, sent: 0, failed: 0, message: "Nicht angemeldet." };
  try {
    const response = await fetch("/api/notify", { method: "POST", headers });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, sent: 0, failed: 0, message: data?.message ?? "Der Versand ist fehlgeschlagen." };
    }
    return {
      ok: true,
      sent: Number(data?.sent ?? 0),
      failed: Number(data?.failed ?? 0),
      message: data?.message ?? "Versand ausgeführt.",
    };
  } catch {
    return { ok: false, sent: 0, failed: 0, message: "Der Server ist nicht erreichbar." };
  }
}
