// ============================================================
// GET    /api/media/policy      – erlaubte Typen und Grenzen (jede Anmeldung)
// POST   /api/media/upload-url  – Upload anmelden, signierten Verweis holen (Redaktion)
// POST   /api/media/finalize    – abgelegte Datei prüfen und freigeben (Redaktion)
// GET    /api/media/url         – kurzlebige Abrufadresse (jeder Berechtigte)
// DELETE /api/media             – Datei und Eintrag entfernen (Redaktion)
//
// ── Warum der Upload NICHT durch diese Funktion läuft ────────────────────────
// Netlify begrenzt Anfragegröße und Laufzeit einer Serverfunktion. Ein
// 40-MB-Video passt dort nicht durch. Der Browser lädt deshalb direkt in die
// Ablage, autorisiert durch einen signierten Verweis, den diese Funktion nach
// der Rechteprüfung ausstellt.
//
// ── Warum trotzdem serverseitig geprüft wird ─────────────────────────────────
// Wer direkt in die Ablage schreibt, kann beim Anmelden alles behaupten.
// `finalize` prüft deshalb, was tatsächlich angekommen ist: die Größe aus der
// Ablage und den Typ aus den ersten Bytes. Bis dahin steht der Eintrag auf
// `pending` und ist über keinen Weg abrufbar. Fällt die Datei durch, wird sie
// gelöscht – nicht nur markiert.
//
// ── Warum das Supabase-Token und nicht das Keycloak-Token ────────────────────
// Ob jemand eine Datei sehen darf, hängt an der Sichtbarkeit des Trainings.
// Diese Regel steht bereits in der Datenbank (`auth_can_see_training`). Statt
// sie hier ein zweites Mal in JavaScript nachzubauen – mit der Gewissheit, dass
// beide Fassungen irgendwann auseinanderlaufen – fragt diese Funktion die
// Datenbank MIT DEM TOKEN DES AUFRUFERS. Kommt eine Zeile zurück, ist der
// Zugriff erlaubt. Kommt keine, nicht. Die RLS bleibt die einzige Instanz.
//
// Der Dienstschlüssel kommt erst danach zum Einsatz, um die signierte Adresse
// auszustellen – für eine Datei, deren Freigabe bereits feststeht.
//
// NICHT enthalten: Virenprüfung. Siehe docs/medien.md.
// ============================================================

import { jwtVerify } from "jose";
import { json, parseJsonBody, requestPath } from "./_lib/http.mjs";
import { allow, audit, clientIp, tooManyRequests } from "./_lib/guard.mjs";
import { supabaseConfig } from "./_lib/supabase.mjs";
import {
  checkDeclared,
  matchesSignature,
  mediaPolicy,
  safeOriginalName,
  SIGNATURE_HEAD_BYTES,
  storageKey,
} from "./_lib/media-policy.mjs";

const BUCKET = "training-media";
const OUTBOUND_TIMEOUT_MS = 15_000;
/** Gültigkeit einer Abrufadresse. Kurz genug, dass ein weitergeleiteter Link
 *  nichts mehr wert ist; lang genug für ein Video in voller Länge. */
const DOWNLOAD_TTL_SECONDS = 20 * 60;
const UPLOAD_TTL_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Identität ────────────────────────────────────────────────────────────────

/**
 * Prüft das Supabase-Token des Aufrufers.
 *
 * Das Token stammt aus `/api/auth/exchange` und ist mit demselben Geheimnis
 * signiert, das auch PostgREST prüft. Wer es fälschen könnte, käme ohnehin
 * direkt an die Datenbank – die Prüfung hier ist also nicht schwächer als die
 * dahinter, sondern dieselbe.
 */
async function authenticate(event) {
  const header = String(
    event?.headers?.authorization ?? event?.headers?.Authorization ?? "").trim();
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (token === "") {
    return { ok: false, response: json(401, { code: "INVALID_TOKEN", message: "Anmeldung erforderlich." }) };
  }

  const secret = String(process.env.SUPABASE_JWT_SECRET ?? "");
  if (secret === "") {
    console.error("[media] SUPABASE_JWT_SECRET fehlt.");
    return {
      ok: false,
      response: json(500, { code: "CONFIG_ERROR", message: "Serverkonfiguration unvollständig." }),
    };
  }

  let payload;
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    payload = result.payload;
  } catch (error) {
    console.warn("[media] Token abgelehnt:", error?.code ?? error?.name ?? "unknown");
    return { ok: false, response: json(401, { code: "INVALID_TOKEN", message: "Token ist ungültig." }) };
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!UUID.test(sub)) {
    return { ok: false, response: json(401, { code: "INVALID_TOKEN", message: "Token ohne gültige Kennung." }) };
  }

  const roles = Array.isArray(payload.academy_roles)
    ? payload.academy_roles.filter((r) => typeof r === "string")
    : [];

  return {
    ok: true,
    token,
    identity: {
      sub,
      appUserId: sub,                       // `sub` IST die app_user-Kennung
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      roles,
      isEditor: roles.includes("editor"),
      isAdmin: roles.includes("admin"),
    },
  };
}

function forbidden(message = "Für diese Aktion ist die Rolle editor erforderlich.") {
  return json(403, { code: "FORBIDDEN", message });
}

// ─── Datenbank- und Ablagezugriffe ────────────────────────────────────────────

/** PostgREST MIT dem Token des Aufrufers – die RLS entscheidet. */
async function restAsCaller(token, path, { method = "GET", body, prefer, query } = {}) {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { ok: false, status: 0, data: null };

  const url = new URL(`${cfg.url}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        apikey: cfg.key,                     // Projektschlüssel, nur zur Zuordnung
        Authorization: `Bearer ${token}`,    // maßgeblich für die RLS
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    const text = await response.text().catch(() => "");
    let data = null;
    if (text !== "") { try { data = JSON.parse(text); } catch { data = null; } }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error("[media] Datenbank nicht erreichbar:", error?.name ?? "unknown");
    return { ok: false, status: 0, data: null };
  }
}

/** Ablage-Zugriff mit Dienstschlüssel. Erst NACH einer Rechteprüfung aufrufen. */
async function storageFetch(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { ok: false, status: 0, data: null };
  try {
    const response = await fetch(`${cfg.url}/storage/v1${path}`, {
      method,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
    if (raw) {
      const buffer = response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
      return { ok: response.ok, status: response.status, bytes: buffer };
    }
    const text = await response.text().catch(() => "");
    let data = null;
    if (text !== "") { try { data = JSON.parse(text); } catch { data = null; } }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error("[media] Ablage nicht erreichbar:", error?.name ?? "unknown");
    return { ok: false, status: 0, data: null };
  }
}

/** Entfernt eine Datei aus der Ablage. Fehler werden gemeldet, nicht geworfen. */
async function removeObject(fileKey) {
  const result = await storageFetch(`/object/${BUCKET}`, {
    method: "DELETE",
    body: { prefixes: [fileKey] },
  });
  if (!result.ok) console.warn("[media] Datei nicht entfernt, Status:", result.status);
  return result.ok;
}

// ─── Routen ───────────────────────────────────────────────────────────────────

/** Erlaubte Typen und Grenzen – damit die Oberfläche nichts abschreiben muss. */
function handlePolicy() {
  const policy = mediaPolicy();
  const out = {};
  for (const [type, rule] of Object.entries(policy)) {
    out[type] = {
      label: rule.label,
      mimeTypes: rule.mimeTypes,
      extensions: rule.extensions,
      maxBytes: rule.maxBytes,
      maxMb: Math.round(rule.maxBytes / (1024 * 1024)),
    };
  }
  return json(200, { policy: out });
}

/**
 * Meldet einen Upload an: prüft Angaben, legt den Eintrag an, gibt einen
 * signierten Verweis zurück.
 */
async function handleUploadUrl(event, auth) {
  if (!auth.identity.isEditor) return forbidden();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return json(400, { code: "BAD_REQUEST", message: "Ungültige Anfrage." });
  const { elementId, filename, mime, size, languageCode } = parsed.value;

  if (!UUID.test(String(elementId ?? ""))) {
    return json(400, { code: "BAD_REQUEST", message: "Elementkennung fehlt oder ist ungültig." });
  }
  const language = languageCode === undefined || languageCode === null || languageCode === ""
    ? null
    : String(languageCode).slice(0, 10);

  // Das Element MIT DEM TOKEN DES AUFRUFERS lesen: Wer es nicht bearbeiten
  // darf, sieht es hier nicht – und bekommt keinen Upload-Verweis.
  const element = await restAsCaller(auth.token, "/rest/v1/content_element", {
    query: { select: "id,type,chapter_id", id: `eq.${elementId}`, limit: "1" },
  });
  const row = Array.isArray(element.data) ? element.data[0] : null;
  if (!element.ok || !row) {
    return json(404, { code: "NOT_FOUND", message: "Element nicht gefunden." });
  }

  const declared = checkDeclared(row.type, { mime, size, filename });
  if (!declared.ok) {
    return json(422, { code: "UNSUPPORTED_MEDIA", message: declared.message });
  }

  // Eine frühere, nie abgeschlossene Anmeldung für dasselbe Element und
  // dieselbe Sprache würde den eindeutigen Index blockieren. Sie wird ersetzt,
  // nicht umgangen – sonst scheitert jeder zweite Versuch an der ersten Leiche.
  const stale = await restAsCaller(auth.token, "/rest/v1/asset", {
    query: {
      select: "id,file_key,status",
      element_id: `eq.${elementId}`,
      ...(language === null ? { language_code: "is.null" } : { language_code: `eq.${language}` }),
      status: "eq.pending",
    },
  });
  for (const old of Array.isArray(stale.data) ? stale.data : []) {
    if (old?.file_key) await removeObject(old.file_key);
    await restAsCaller(auth.token, "/rest/v1/asset", {
      method: "DELETE", query: { id: `eq.${old.id}` },
    });
  }

  const created = await restAsCaller(auth.token, "/rest/v1/asset", {
    method: "POST",
    query: { select: "id" },
    prefer: "return=representation",
    body: [{
      element_id: elementId,
      language_code: language,
      // `file_key` ist NOT NULL und braucht die noch unbekannte Kennung –
      // deshalb zunächst ein Platzhalter, der gleich darauf ersetzt wird.
      file_key: "pending",
      mime: String(mime),
      size_bytes: Number(size),
      original_name: safeOriginalName(filename),
      status: "pending",
      uploaded_by: auth.identity.appUserId,
    }],
  });
  const asset = Array.isArray(created.data) ? created.data[0] : null;
  if (!created.ok || !asset?.id) {
    console.error("[media] Eintrag nicht angelegt, Status:", created.status);
    return json(502, { code: "STORAGE_ERROR", message: "Der Upload konnte nicht vorbereitet werden." });
  }

  const fileKey = storageKey(elementId, asset.id, mime);
  await restAsCaller(auth.token, "/rest/v1/asset", {
    method: "PATCH", query: { id: `eq.${asset.id}` }, body: { file_key: fileKey },
  });

  const signed = await storageFetch(`/object/upload/sign/${BUCKET}/${fileKey}`, {
    method: "POST",
    body: { expiresIn: UPLOAD_TTL_SECONDS },
  });
  if (!signed.ok || typeof signed.data?.url !== "string") {
    console.error("[media] Signierter Upload-Verweis fehlgeschlagen, Status:", signed.status);
    await restAsCaller(auth.token, "/rest/v1/asset", { method: "DELETE", query: { id: `eq.${asset.id}` } });
    return json(502, { code: "STORAGE_ERROR", message: "Der Upload konnte nicht vorbereitet werden." });
  }

  const cfg = supabaseConfig();
  return json(200, {
    assetId: asset.id,
    // `signed.data.url` ist bereits ein vollständiger Pfad mit Token.
    uploadUrl: `${cfg.url}/storage/v1${signed.data.url}`,
    mime: String(mime),
    expiresInSeconds: UPLOAD_TTL_SECONDS,
  });
}

/**
 * Prüft die abgelegte Datei und gibt sie frei.
 *
 * Erst hier wird aus einer Behauptung eine Tatsache: Größe und Signatur
 * stammen aus der Ablage, nicht aus der Anmeldung.
 */
async function handleFinalize(event, auth) {
  if (!auth.identity.isEditor) return forbidden();

  const parsed = parseJsonBody(event);
  if (!parsed.ok) return json(400, { code: "BAD_REQUEST", message: "Ungültige Anfrage." });
  const assetId = String(parsed.value?.assetId ?? "");
  if (!UUID.test(assetId)) {
    return json(400, { code: "BAD_REQUEST", message: "Dateikennung fehlt oder ist ungültig." });
  }

  const found = await restAsCaller(auth.token, "/rest/v1/asset", {
    query: { select: "id,element_id,file_key,mime,status,size_bytes", id: `eq.${assetId}`, limit: "1" },
  });
  const asset = Array.isArray(found.data) ? found.data[0] : null;
  if (!found.ok || !asset) return json(404, { code: "NOT_FOUND", message: "Eintrag nicht gefunden." });

  const reject = async (message, detail) => {
    await removeObject(asset.file_key);
    await restAsCaller(auth.token, "/rest/v1/asset", {
      method: "PATCH", query: { id: `eq.${assetId}` }, body: { status: "rejected" },
    });
    await audit({
      identity: auth.identity, action: "media.rejected", targetType: "asset",
      targetId: assetId, outcome: "denied", detail,
    });
    return json(422, { code: "UNSUPPORTED_MEDIA", message });
  };

  // ── Tatsächliche Größe aus der Ablage ────────────────────────────────────
  const info = await storageFetch(`/object/info/${BUCKET}/${asset.file_key}`);
  if (!info.ok) {
    return json(422, {
      code: "NOT_UPLOADED",
      message: "Die Datei ist nicht in der Ablage angekommen. Bitte erneut hochladen.",
    });
  }
  const actualSize = Number(info.data?.size ?? info.data?.contentLength ?? 0);
  const rule = mediaPolicy();
  const limit = Object.values(rule).find(r => r.mimeTypes.includes(asset.mime))?.maxBytes ?? 0;
  if (actualSize > 0 && limit > 0 && actualSize > limit) {
    return reject(
      `Die abgelegte Datei ist mit ${(actualSize / 1048576).toFixed(1)} MB größer als erlaubt.`,
      { grund: "groesse", tatsaechlich: actualSize, erlaubt: limit });
  }

  // ── Tatsächlicher Typ aus den ersten Bytes ───────────────────────────────
  const head = await storageFetch(`/object/${BUCKET}/${asset.file_key}`, {
    headers: { Range: `bytes=0-${SIGNATURE_HEAD_BYTES - 1}` },
    raw: true,
  });
  if (!head.ok || !head.bytes || head.bytes.length < 4) {
    return reject("Die Datei konnte nicht gelesen werden.", { grund: "unlesbar" });
  }
  if (!matchesSignature(head.bytes, asset.mime)) {
    return reject(
      `Der Inhalt der Datei entspricht nicht dem Typ „${asset.mime}".`,
      { grund: "signatur", angegeben: asset.mime });
  }

  const updated = await restAsCaller(auth.token, "/rest/v1/asset", {
    method: "PATCH",
    query: { id: `eq.${assetId}`, select: "id,status" },
    prefer: "return=representation",
    body: {
      status: "ready",
      ready_at: new Date().toISOString(),
      ...(actualSize > 0 ? { size_bytes: actualSize } : {}),
      ...(parsed.value?.meta && typeof parsed.value.meta === "object"
        ? { meta: sanitizeMeta(parsed.value.meta) }
        : {}),
    },
  });
  if (!updated.ok) {
    return json(502, { code: "STORAGE_ERROR", message: "Die Freigabe konnte nicht gespeichert werden." });
  }

  await audit({
    identity: auth.identity, action: "media.uploaded", targetType: "asset",
    targetId: assetId, detail: { mime: asset.mime, bytes: actualSize },
  });
  return json(200, { assetId, status: "ready", sizeBytes: actualSize });
}

/**
 * Anzeigedaten aus dem Browser. Sie beeinflussen keine Entscheidung, deshalb
 * genügt eine Begrenzung auf wenige Zahlenfelder – gespeichert wird nichts,
 * was jemand als Text unterschieben könnte.
 */
function sanitizeMeta(raw) {
  const out = {};
  for (const key of ["durationSeconds", "width", "height"]) {
    const value = Number(raw?.[key]);
    if (Number.isFinite(value) && value > 0 && value < 1e7) out[key] = Math.round(value);
  }
  return out;
}

/** Kurzlebige Abrufadresse – für jeden, der die Datei sehen darf. */
async function handleDownloadUrl(event, auth) {
  const assetId = String(event?.queryStringParameters?.assetId ?? "");
  if (!UUID.test(assetId)) {
    return json(400, { code: "BAD_REQUEST", message: "Dateikennung fehlt oder ist ungültig." });
  }

  // DIE Rechteprüfung: mit dem Token des Aufrufers. Die RLS lässt nur durch,
  // was zu einem sichtbaren Training gehört und freigegeben ist.
  const found = await restAsCaller(auth.token, "/rest/v1/asset", {
    query: {
      select: "id,file_key,mime,original_name,size_bytes,meta",
      id: `eq.${assetId}`, status: "eq.ready", limit: "1",
    },
  });
  const asset = Array.isArray(found.data) ? found.data[0] : null;
  if (!found.ok || !asset) {
    // Bewusst 404 statt 403: Ob es die Datei gibt, ist selbst eine Auskunft.
    return json(404, { code: "NOT_FOUND", message: "Datei nicht verfügbar." });
  }

  const signed = await storageFetch(`/object/sign/${BUCKET}/${asset.file_key}`, {
    method: "POST",
    body: { expiresIn: DOWNLOAD_TTL_SECONDS },
  });
  if (!signed.ok || typeof signed.data?.signedURL !== "string") {
    console.error("[media] Signierte Adresse fehlgeschlagen, Status:", signed.status);
    return json(502, { code: "STORAGE_ERROR", message: "Die Datei ist gerade nicht abrufbar." });
  }

  const cfg = supabaseConfig();
  return json(200, {
    url: `${cfg.url}/storage/v1${signed.data.signedURL}`,
    mime: asset.mime,
    originalName: asset.original_name,
    sizeBytes: asset.size_bytes,
    meta: asset.meta ?? {},
    expiresInSeconds: DOWNLOAD_TTL_SECONDS,
  });
}

/** Entfernt Datei und Eintrag. */
async function handleDelete(event, auth) {
  if (!auth.identity.isEditor) return forbidden();

  const assetId = String(event?.queryStringParameters?.assetId ?? "");
  if (!UUID.test(assetId)) {
    return json(400, { code: "BAD_REQUEST", message: "Dateikennung fehlt oder ist ungültig." });
  }

  const found = await restAsCaller(auth.token, "/rest/v1/asset", {
    query: { select: "id,file_key", id: `eq.${assetId}`, limit: "1" },
  });
  const asset = Array.isArray(found.data) ? found.data[0] : null;
  if (!found.ok || !asset) return json(404, { code: "NOT_FOUND", message: "Eintrag nicht gefunden." });

  // Erst die Datei, dann der Eintrag. Andersherum bliebe bei einem Fehler eine
  // Datei ohne Eintrag zurück – die niemand mehr findet und niemand mehr löscht.
  await removeObject(asset.file_key);
  const removed = await restAsCaller(auth.token, "/rest/v1/asset", {
    method: "DELETE", query: { id: `eq.${assetId}` },
  });
  if (!removed.ok) {
    return json(502, { code: "STORAGE_ERROR", message: "Der Eintrag konnte nicht entfernt werden." });
  }

  await audit({
    identity: auth.identity, action: "media.deleted", targetType: "asset", targetId: assetId,
  });
  return json(200, { assetId, deleted: true });
}

// ─── Einstieg ─────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const method = String(event?.httpMethod ?? "GET").toUpperCase();
  const path = requestPath(event);
  const route = path.replace(/^.*\/media/, "").replace(/\/+$/, "") || "/";

  if (method === "OPTIONS") return json(204, {});

  const auth = await authenticate(event);
  if (!auth.ok) return auth.response;

  // Die Grenzen sind großzügig: Sie sollen einen Fehlerkreislauf abfangen,
  // nicht die tägliche Redaktionsarbeit behindern.
  const ip = clientIp(event?.headers);
  const bucket = auth.identity.isEditor ? `media:${auth.identity.sub}` : `media-read:${ip}`;
  const [limit, seconds] = auth.identity.isEditor ? [200, 3600] : [300, 3600];
  if (!(await allow(bucket, limit, seconds))) return tooManyRequests(seconds);

  try {
    if (method === "GET"    && route === "/policy")     return handlePolicy();
    if (method === "GET"    && route === "/url")        return handleDownloadUrl(event, auth);
    if (method === "POST"   && route === "/upload-url") return handleUploadUrl(event, auth);
    if (method === "POST"   && route === "/finalize")   return handleFinalize(event, auth);
    if (method === "DELETE" && route === "/")           return handleDelete(event, auth);
  } catch (error) {
    console.error("[media] Unerwarteter Fehler:", error?.name ?? "unknown");
    return json(500, { code: "INTERNAL_ERROR", message: "Unerwarteter Fehler." });
  }

  return json(405, { code: "METHOD_NOT_ALLOWED", message: `${method} ${route} wird nicht unterstützt.` });
};
