// ============================================================
// HTTP-Hilfsfunktionen für die Netlify Functions.
//
// Sicherheitsrelevant: JEDE Antwort trägt `Cache-Control: no-store`.
// Die Antworten enthalten Tokens und personenbezogene Daten – sie dürfen
// weder im Browser noch in einem Zwischenproxy landen.
// ============================================================

const BASE_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  // Verhindert, dass ein Proxy den Antworttyp umdeutet.
  "X-Content-Type-Options": "nosniff",
  // Antworten sind nie für Dritte gedacht.
  "Referrer-Policy": "no-referrer",
});

/**
 * Baut eine JSON-Antwort im Netlify-Functions-Format (v1-Handler).
 * @param {number} statusCode
 * @param {unknown} body
 * @param {Record<string,string>} [extraHeaders]
 */
export function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: { ...BASE_HEADERS, ...(extraHeaders ?? {}) },
    body: JSON.stringify(body ?? {}),
  };
}

/**
 * Header-Zugriff ohne Rücksicht auf Groß-/Kleinschreibung.
 * Netlify normalisiert Header üblicherweise auf Kleinbuchstaben, garantiert
 * ist das aber nicht – bei der Authorization-Prüfung darf das nicht kippen.
 * @param {Record<string,unknown>|undefined|null} headers
 * @param {string} name
 * @returns {string|null}
 */
export function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key === "string" && key.toLowerCase() === wanted) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
      return null;
    }
  }
  return null;
}

/**
 * Liest den Request-Body als JSON. Netlify kann den Body base64-kodiert
 * übergeben (binäre Uploads) – das wird hier mitbehandelt.
 * @param {{body?: string|null, isBase64Encoded?: boolean}} event
 * @returns {{ok: true, value: any} | {ok: false, reason: string}}
 */
export function parseJsonBody(event) {
  const raw = event?.body;
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, reason: "EMPTY" };
  }
  let text = raw;
  if (event?.isBase64Encoded) {
    try {
      text = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      return { ok: false, reason: "MALFORMED" };
    }
  }
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, reason: "NOT_AN_OBJECT" };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}

/**
 * Ermittelt den ursprünglich angefragten Pfad. Netlify rewritet
 * `/api/...` per Redirect auf `/.netlify/functions/...`; je nach Runtime
 * steht der Originalpfad in `path`, `rawUrl` oder einem Netlify-Header.
 * Wird gebraucht, um Unterrouten zu trennen: `/api/admin/invite` von
 * `.../invite/resend`, `/api/admin/smtp` von `.../smtp/test`.
 * @param {any} event
 * @returns {string}
 */
export function requestPath(event) {
  const candidates = [];
  if (typeof event?.path === "string") candidates.push(event.path);
  const originalPath = getHeader(event?.headers, "x-nf-original-path");
  if (originalPath) candidates.push(originalPath);
  if (typeof event?.rawUrl === "string") {
    try {
      candidates.push(new URL(event.rawUrl).pathname);
    } catch {
      /* rawUrl unbrauchbar – ignorieren */
    }
  }
  if (candidates.length === 0) return "";

  // Der spezifischste Pfad gewinnt, gemessen an der Zahl der Segmente.
  // Netlify liefert als `path` oft den Funktionspfad ohne Unterroute
  // (`/.netlify/functions/admin-smtp`), während der tatsächlich aufgerufene
  // Pfad (`/api/admin/smtp/test`) nur in `rawUrl` oder im Header steht.
  // Früher stand hier eine feste Prüfung auf `/resend`; das musste bei jeder
  // neuen Unterroute nachgezogen werden – und wurde beim ersten Mal vergessen.
  const segments = (p) => p.replace(/\/+$/, "").split("/").filter(Boolean).length;
  return candidates.reduce((best, p) => (segments(p) > segments(best) ? p : best), candidates[0]);
}
