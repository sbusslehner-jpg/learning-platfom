// ============================================================
// Missbrauchsschutz (R-13) und Audit-Trail (R-10) für die Serverfunktionen.
//
// Beide Bausteine liegen bewusst in der Datenbank und nicht im Modulspeicher:
// Netlify Functions sind zustandslos. Ein Zähler in einer warmen Instanz hält
// genau so lange, wie dieselbe Instanz antwortet – bei verteiltem Missbrauch
// also gerade nicht. Und ein Protokoll, das mit der Instanz verschwindet, ist
// keines.
//
// Beide sind **nicht fatal**: Ist die Datenbank kurz nicht erreichbar, wird die
// Anfrage durchgelassen bzw. das Ereignis verworfen, statt den Betrieb zu
// stoppen. Ein Ausfall der Protokollierung darf keine Anmeldung verhindern.
// ============================================================

import { supabaseConfig } from "./supabase.mjs";

const RPC_TIMEOUT_MS = 4_000;

/** Ruft eine Postgres-Funktion über PostgREST auf (Service-Role). */
async function rpc(name, args) {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { ok: false, data: null };
  try {
    const response = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, data: null };
    return { ok: true, data: await response.json().catch(() => null) };
  } catch {
    return { ok: false, data: null };
  }
}

/**
 * Ermittelt die Quell-IP aus den Netlify-Kopfzeilen.
 * Nur zur Bildung des Zählschlüssels – sie wird nirgends gespeichert.
 */
export function clientIp(headers) {
  const get = (name) => {
    if (!headers || typeof headers !== "object") return null;
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === name && typeof v === "string") return v;
    }
    return null;
  };
  const nf = get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unbekannt";
}

/**
 * Prüft und zählt einen Zugriff.
 *
 * @param {string} bucket  Schlüssel, z. B. `exchange:1.2.3.4`
 * @param {number} limit   erlaubte Zugriffe je Fenster
 * @param {number} seconds Fensterlänge
 * @returns {Promise<boolean>} true = erlaubt
 */
export async function allow(bucket, limit, seconds) {
  const result = await rpc("rate_limit_hit", {
    p_bucket: String(bucket).slice(0, 200),
    p_limit: limit,
    p_seconds: seconds,
  });
  // Nicht erreichbar → durchlassen. Ein Ausfall des Zählers darf den Betrieb
  // nicht stoppen; die Rollenprüfungen greifen ohnehin weiterhin.
  if (!result.ok) return true;
  return result.data !== false;
}

/** Einheitliche Antwort bei erreichtem Limit. */
export function tooManyRequests(seconds) {
  return {
    statusCode: 429,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(seconds),
    },
    body: JSON.stringify({
      code: "RATE_LIMITED",
      message: "Zu viele Anfragen. Bitte in einigen Minuten erneut versuchen.",
    }),
  };
}

/**
 * Schreibt ein Audit-Ereignis.
 *
 * Bewusst ohne `await` verwendbar und niemals werfend: Die protokollierte
 * Aktion ist bereits geschehen: sie nachträglich scheitern zu lassen, weil das
 * Protokoll klemmt, wäre die schlechtere Wahl. Fehler landen im Function-Log.
 *
 * `detail` darf **keine** Geheimnisse und keine Inhaltsdaten enthalten – nur
 * das, was zur Nachvollziehbarkeit nötig ist.
 */
export async function audit({ identity, action, targetType, targetId, outcome = "ok", detail = {} }) {
  const cfg = supabaseConfig();
  if (!cfg.configured) return;
  const row = {
    // `sub` des ausgetauschten Tokens ist die app_user-Kennung. Fehlt sie
    // (Provisionierung fehlgeschlagen), bleibt das Feld leer – das Ereignis
    // wird trotzdem geschrieben.
    actor_id: isUuid(identity?.appUserId) ? identity.appUserId : null,
    // Klartext-Kennzeichnung, damit das Protokoll auch nach dem Löschen des
    // Kontos aussagekräftig bleibt.
    actor_label: String(identity?.email || identity?.name || identity?.sub || "unbekannt").slice(0, 200),
    action: String(action).slice(0, 100),
    target_type: targetType ? String(targetType).slice(0, 50) : null,
    target_id: targetId ? String(targetId).slice(0, 100) : null,
    outcome: String(outcome).slice(0, 20),
    detail,
  };
  try {
    const response = await fetch(`${cfg.url}/rest/v1/audit_event`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("[audit] Ereignis nicht gespeichert, Status:", response.status);
    }
  } catch (error) {
    console.warn("[audit] Ereignis nicht gespeichert:", error?.name ?? "unknown");
  }
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
