import { getFreshSupabaseToken, KEYCLOAK_MODE } from "./keycloakAuth";

// ─── Medien (R-03) ────────────────────────────────────────────────────────────
//
// Der Upload läuft in drei Schritten, und der Umweg hat einen Grund:
//
//   1. anmelden   → der Server prüft Typ und Größe und gibt einen signierten
//                   Verweis zurück
//   2. hochladen  → der Browser lädt DIREKT in die Ablage. Durch die
//                   Serverfunktion passt ein Video nicht: Netlify begrenzt
//                   Anfragegröße und Laufzeit.
//   3. freigeben  → der Server prüft, was tatsächlich angekommen ist, und
//                   gibt die Datei erst dann frei
//
// Scheitert Schritt 2 oder 3, bleibt ein `pending`-Eintrag zurück. Der ist
// harmlos: Er ist für niemanden abrufbar und wird beim nächsten Versuch für
// dasselbe Element ersetzt.
//
// Die erlaubten Typen und Grenzen werden NICHT hier festgelegt, sondern vom
// Server abgefragt. Eine zweite Liste im Browser liefe irgendwann auseinander –
// und der Fehler fiele erst nach dem Hochladen auf.

export interface MediaRule {
  label: string;
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
  maxMb: number;
}
export type MediaPolicy = Record<string, MediaRule>;

export interface MediaRef {
  url: string;
  mime: string;
  originalName: string | null;
  sizeBytes: number | null;
  meta: { durationSeconds?: number; width?: number; height?: number };
  expiresInSeconds: number;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  if (!KEYCLOAK_MODE) return null;
  const token = await getFreshSupabaseToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/** Liest die Fehlermeldung des Servers – sie ist für Menschen geschrieben. */
async function readMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" && body.message ? body.message : fallback;
  } catch {
    return fallback;
  }
}

let policyCache: MediaPolicy | null = null;

/** Erlaubte Dateitypen und Grenzen. Wird einmal je Sitzung geholt. */
export async function fetchMediaPolicy(): Promise<MediaPolicy | null> {
  if (policyCache) return policyCache;
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const response = await fetch("/api/media/policy", { headers });
    if (!response.ok) return null;
    const body = await response.json();
    policyCache = body?.policy ?? null;
    return policyCache;
  } catch {
    return null;
  }
}

export interface UploadOutcome {
  ok: boolean;
  assetId?: string;
  message?: string;
}

/**
 * Lädt eine Datei zu einem Inhaltselement hoch.
 *
 * @param onProgress 0..1 – bezieht sich ausschließlich auf die Übertragung.
 *   Die anschließende Prüfung ist nicht messbar; deshalb bleibt der Balken
 *   danach kurz bei 100 % stehen, statt eine Genauigkeit vorzutäuschen.
 */
export async function uploadMedia(
  elementId: string,
  file: File,
  onProgress?: (fraction: number) => void,
  languageCode?: string | null,
): Promise<UploadOutcome> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, message: "Nicht angemeldet." };

  // ── 1. Anmelden ──────────────────────────────────────────────────────────
  let announced: Response;
  try {
    announced = await fetch("/api/media/upload-url", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        elementId,
        filename: file.name,
        mime: file.type,
        size: file.size,
        languageCode: languageCode ?? null,
      }),
    });
  } catch {
    return { ok: false, message: "Der Server ist nicht erreichbar." };
  }
  if (!announced.ok) {
    return { ok: false, message: await readMessage(announced, "Der Upload wurde abgelehnt.") };
  }
  const { assetId, uploadUrl } = await announced.json();

  // ── 2. Direkt in die Ablage ──────────────────────────────────────────────
  // XMLHttpRequest statt fetch, weil nur damit der Fortschritt messbar ist.
  // Bei einem 50-MB-Video ist ein Balken kein Zierrat: Ohne ihn sieht ein
  // langsamer Upload wie ein Absturz aus.
  const uploaded = await new Promise<{ ok: boolean; status: number }>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl, true);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300, status: request.status });
    request.onerror = () => resolve({ ok: false, status: 0 });
    request.onabort = () => resolve({ ok: false, status: 0 });
    request.send(file);
  });
  if (!uploaded.ok) {
    return { ok: false, message: "Die Datei konnte nicht übertragen werden." };
  }
  onProgress?.(1);

  // ── 3. Freigeben ─────────────────────────────────────────────────────────
  const meta = await readMediaMeta(file);
  let finalized: Response;
  try {
    finalized = await fetch("/api/media/finalize", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, meta }),
    });
  } catch {
    return { ok: false, message: "Die Datei wurde übertragen, konnte aber nicht geprüft werden." };
  }
  if (!finalized.ok) {
    return { ok: false, message: await readMessage(finalized, "Die Datei hat die Prüfung nicht bestanden.") };
  }
  return { ok: true, assetId };
}

/**
 * Liest Laufzeit bzw. Abmessungen aus der Datei – rein für die Anzeige.
 * Schlägt es fehl, ist das kein Fehler: Die Angabe ist entbehrlich.
 */
async function readMediaMeta(file: File): Promise<Record<string, number>> {
  if (file.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      const done = (value: Record<string, number>) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      probe.onloadedmetadata = () => done(
        Number.isFinite(probe.duration) && probe.duration > 0
          ? { durationSeconds: Math.round(probe.duration) }
          : {});
      probe.onerror = () => done({});
      probe.src = url;
    });
  }
  if (file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const probe = new Image();
      const done = (value: Record<string, number>) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      probe.onload = () => done({ width: probe.naturalWidth, height: probe.naturalHeight });
      probe.onerror = () => done({});
      probe.src = url;
    });
  }
  return {};
}

/**
 * Holt eine kurzlebige Abrufadresse.
 *
 * Bewusst nicht zwischengespeichert: Die Adresse läuft ab, und eine abgelaufene
 * aus dem Speicher zu servieren wäre schlimmer als ein zweiter Aufruf.
 */
export async function fetchMediaUrl(assetId: string): Promise<MediaRef | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const response = await fetch(`/api/media/url?assetId=${encodeURIComponent(assetId)}`, { headers });
    if (!response.ok) return null;
    const body = await response.json();
    if (typeof body?.url !== "string") return null;
    return {
      url: body.url,
      mime: String(body.mime ?? ""),
      originalName: body.originalName ?? null,
      sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
      meta: body.meta ?? {},
      expiresInSeconds: Number(body.expiresInSeconds ?? 0),
    };
  } catch {
    return null;
  }
}

export async function deleteMedia(assetId: string): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  try {
    const response = await fetch(`/api/media?assetId=${encodeURIComponent(assetId)}`, {
      method: "DELETE",
      headers,
    });
    return response.ok;
  } catch {
    return false;
  }
}
