import { getAccessToken, KEYCLOAK_MODE } from "./keycloakAuth";

// ─── Benutzeränderungen (R-11) ────────────────────────────────────────────────
//
// Der Browser stößt die Änderung an und wertet das Ergebnis aus – mehr nicht.
// Keycloak-Änderung UND Spiegelung nach Supabase laufen serverseitig in einem
// Vorgang.
//
// Vorher lief der zweite Schritt hier: erst die Serverfunktion aufrufen, dann
// selbst in Supabase schreiben. Zwischen beiden lag alles, was einem Browser
// zustoßen kann. Ein geschlossener Tab genügte, damit Ansprüche und Spiegelung
// dauerhaft auseinanderliefen – ohne Fehlermeldung, weil der erste Schritt ja
// funktioniert hatte.
//
// Deshalb gibt es jetzt drei Ergebnisse statt zwei: gelungen, teilweise
// gelungen, fehlgeschlagen. Der mittlere ist der wichtige – er bedeutet, dass
// die Anmeldung bereits die neue Wahrheit kennt und nur die Plattform
// nachziehen muss.

export type UserChangeStatus = "ok" | "partial" | "failed";

export interface UserChangeResult {
  status: UserChangeStatus;
  message?: string;
}

async function post(path: string, body?: unknown): Promise<UserChangeResult> {
  if (!KEYCLOAK_MODE) return { status: "ok" };
  const token = await getAccessToken();
  if (!token) return { status: "failed", message: "Nicht angemeldet." };
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { status: "failed", message: data?.message ?? "Die Änderung ist fehlgeschlagen." };
    }
    return {
      status: data?.status === "partial" ? "partial" : "ok",
      message: data?.message,
    };
  } catch {
    return { status: "failed", message: "Der Server ist nicht erreichbar." };
  }
}

export function updateKeycloakUser(input: Record<string, unknown>): Promise<UserChangeResult> {
  return post("/api/admin/user", input);
}

/** Holt offene Abgleiche nach. */
export function reconcileUserSync(): Promise<UserChangeResult & { resolved?: number; failed?: number }> {
  return post("/api/admin/user/reconcile");
}

export interface PendingSync {
  id: number;
  kind: string;
  externalId: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  actorLabel: string | null;
}

/**
 * Listet offene Abgleiche.
 *
 * `null` heißt „nicht abrufbar" und ist etwas anderes als eine leere Liste.
 * Eine leere Liste bedeutet: alles stimmt überein. Beides gleich darzustellen
 * würde ausgerechnet den Ausfall wie Ordnung aussehen lassen.
 */
export async function fetchPendingSync(): Promise<PendingSync[] | null> {
  if (!KEYCLOAK_MODE) return [];
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const response = await fetch("/api/admin/user/pending", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data?.pending) ? data.pending : null;
  } catch {
    return null;
  }
}
