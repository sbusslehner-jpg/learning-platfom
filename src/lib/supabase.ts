import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Zeitgrenze für Datenabfragen (ms).
 *
 * Ohne Zeitgrenze bleibt die Oberfläche bei einem nicht erreichbaren Backend
 * dauerhaft im Ladezustand hängen – der Request wird nie abgeschlossen und die
 * `.then/.catch`-Zweige der Seiten laufen nie. Mit Abbruch nach Ablauf greifen
 * die vorhandenen Fehlerpfade (Demo-Fallback bzw. Fehlermeldung mit Wiederholung).
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Liefert das im Keycloak-Austausch erhaltene Supabase-Token, sofern vorhanden.
 *
 * Wird verzögert (lazy) geladen, um einen Ringschluss der Module zu vermeiden:
 * `keycloakAuth` benötigt den Supabase-Client, und der Client benötigt hier
 * umgekehrt das Token. Beim ersten Aufruf ist das Modul bereits initialisiert.
 */
// Der Getter ist bewusst asynchron: Beim Seitenaufbau läuft der Tokenaustausch
// noch, während die ersten Abfragen bereits hinausgehen. Ein synchroner Getter
// hätte hier `null` gemeldet, die Anfrage wäre als `anon` gelaufen – und dem
// hat Migration 0005 jeden Zugriff entzogen. Das Ergebnis war kein Fehler,
// sondern eine leere Antwort, die die Oberfläche als „keine Datenbank" deutet
// und mit Demo-Inhalten beantwortet. Deshalb wird hier gewartet.
let tokenGetter: (() => Promise<string | null>) | null = null;

export function registerSupabaseTokenSource(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});

  // Im Keycloak-Modus ersetzt das ausgetauschte Token den anon-Key, damit die
  // RLS-Policies (0005) die echte Identität sehen: `auth.uid()` zeigt auf
  // app_user.id, die Rollen und Märkte stehen als Claims im Token.
  // Der `apikey`-Kopf bleibt der anon-Key – so verlangt es die Supabase-API.
  let exchanged: string | null = null;
  try {
    exchanged = (await tokenGetter?.()) ?? null;
  } catch {
    // Kein Token beschaffbar: Die Anfrage läuft als `anon` und wird von RLS
    // abgewiesen. Das ist die ehrlichere Variante, als sie zu unterdrücken.
    exchanged = null;
  }
  if (exchanged) headers.set("Authorization", `Bearer ${exchanged}`);

  // Ein bereits vorhandenes Abbruchsignal (z. B. von Supabase selbst) bleibt wirksam.
  if (init.signal) return fetch(input, { ...init, headers });
  return fetch(input, {
    ...init,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Supabase-Client der Plattform.
 * `null`, solange die Umgebungsvariablen nicht gesetzt sind – die App
 * fällt dann auf die eingebauten Demo-Daten zurück (src/app/data).
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, { global: { fetch: fetchWithTimeout } })
    : null;

export const isSupabaseConfigured = supabase !== null;
