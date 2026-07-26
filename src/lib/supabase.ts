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

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  // Ein bereits vorhandenes Abbruchsignal (z. B. von Supabase selbst) bleibt wirksam.
  if (init.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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
