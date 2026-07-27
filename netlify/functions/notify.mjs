// ============================================================
// POST /api/notify        – fällige Nachrichten versenden
// GET  /api/notify/status – Kennzahlen der Ausgangsablage
//
// Der Worker aus R-09. Er nimmt fällige Nachrichten aus der Ausgangsablage,
// verschickt sie und vermerkt das Ergebnis. Mehr nicht – die Entscheidung, WER
// WAS bekommt, ist in der Datenbank getroffen (`notify_training_published`),
// wo auch die Sichtbarkeitsregel steht. Eine zweite Empfängerlogik hier würde
// irgendwann davon abweichen, und dann bekämen Leute Post über Trainings, die
// sie nicht öffnen können.
//
// ── Wer darf ihn starten ─────────────────────────────────────────────────────
// Zwei Wege, bewusst getrennt:
//
//   Verwaltung mit gültigem Token – für „jetzt nachsehen" aus der Oberfläche.
//   Ein gemeinsames Geheimnis über den Kopf `X-Notify-Secret` – für eine
//   zeitgesteuerte Ausführung, die kein Benutzerkonto hat.
//
// Ohne gesetztes `NOTIFY_SECRET` ist der zweite Weg zu. Ein Standardwert wäre
// ein offener Endpunkt bei jedem, der ihn nicht überschreibt.
//
// ── Warum jede Nachricht einzeln quittiert wird ──────────────────────────────
// Ein Sammelvermerk am Ende würde bei einem Abbruch mittendrin alle Nachrichten
// als unversendet führen – auch die bereits zugestellten. Beim nächsten Lauf
// gingen sie erneut raus. Doppelte Post ist schlimmer als späte.
// ============================================================

import nodemailer from "nodemailer";
import { json, requestPath } from "./_lib/http.mjs";
import { hasAdminRole, verifyKeycloakToken } from "./_lib/keycloak.mjs";
import { supabaseConfig } from "./_lib/supabase.mjs";
import { audit } from "./_lib/guard.mjs";

const TIMEOUT_MS = 10_000;
/** Wie viele Nachrichten ein Lauf höchstens anfasst. */
const BATCH = Number.parseInt(process.env.NOTIFY_BATCH ?? "", 10) || 20;
/** Nach wie vielen erfolglosen Versuchen eine Nachricht aufgegeben wird. */
const MAX_ATTEMPTS = Number.parseInt(process.env.NOTIFY_MAX_ATTEMPTS ?? "", 10) || 5;

// ─── Zugriff ──────────────────────────────────────────────────────────────────

/**
 * Vergleicht zwei Zeichenketten in konstanter Zeit.
 *
 * Ein gewöhnlicher Vergleich bricht beim ersten abweichenden Zeichen ab. Über
 * viele Versuche ist daraus ableitbar, wie viele Zeichen stimmen – bei einem
 * Geheimnis, das den Versand auslöst, ist das eine unnötige Einladung.
 */
function secretsMatch(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function authorize(event) {
  const expected = String(process.env.NOTIFY_SECRET ?? "");
  const provided = event?.headers?.["x-notify-secret"] ?? event?.headers?.["X-Notify-Secret"];
  if (expected !== "" && secretsMatch(expected, provided)) {
    return { ok: true, identity: { name: "Zeitsteuerung", email: null, sub: "cron" } };
  }

  const verified = await verifyKeycloakToken(event?.headers);
  if (!verified.ok) {
    return { ok: false, response: json(401, { code: "INVALID_TOKEN", message: "Anmeldung erforderlich." }) };
  }
  if (!hasAdminRole(verified.identity)) {
    return { ok: false, response: json(403, { code: "FORBIDDEN", message: "Adminrolle erforderlich." }) };
  }
  return { ok: true, identity: verified.identity };
}

// ─── Datenbank ────────────────────────────────────────────────────────────────

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
      body: JSON.stringify(args ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[notify] RPC fehlgeschlagen:", name, response.status);
      return { ok: false, data: null };
    }
    return { ok: true, data: await response.json().catch(() => null) };
  } catch (error) {
    console.error("[notify] Datenbank nicht erreichbar:", error?.name ?? "unknown");
    return { ok: false, data: null };
  }
}

// ─── Versand ──────────────────────────────────────────────────────────────────

/**
 * Baut den Postausgang.
 *
 * Die Zugangsdaten liegen in den Netlify-Variablen und NICHT in der
 * Realm-Konfiguration von Keycloak: Keycloak gibt ein gespeichertes Passwort
 * nicht wieder heraus, es maskiert es. Es sind dieselben Werte, die in
 * Verwaltung → Einstellungen → E-Mail eingetragen werden.
 */
function buildTransport() {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const from = String(process.env.SMTP_FROM ?? "").trim();
  if (host === "" || from === "") return { ok: false, reason: "SMTP_NICHT_KONFIGURIERT" };

  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10) || 587;
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASSWORD ?? "");

  return {
    ok: true,
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      // 465 ist implizit verschlüsselt, 587 beginnt unverschlüsselt und
      // wechselt über STARTTLS. Das falsch zu setzen führt zu einem Timeout,
      // der wie ein Netzproblem aussieht.
      secure: port === 465,
      requireTLS: port !== 465,
      ...(user ? { auth: { user, pass } } : {}),
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    }),
  };
}

// ─── Routen ───────────────────────────────────────────────────────────────────

async function handleStatus() {
  const stats = await rpc("notify_stats", {});
  if (!stats.ok) {
    return json(502, { code: "DB_UNREACHABLE", message: "Kennzahlen sind nicht abrufbar." });
  }
  const row = Array.isArray(stats.data) ? stats.data[0] : stats.data;
  const smtp = buildTransport();
  return json(200, {
    pending: row?.offen ?? 0,
    sent: row?.versendet ?? 0,
    dead: row?.gescheitert ?? 0,
    oldestPending: row?.aeltester ?? null,
    // Ohne diese Angabe sähe eine stehende Warteschlange nach einem Fehler aus,
    // obwohl schlicht kein Postausgang eingerichtet ist.
    smtpConfigured: smtp.ok,
  });
}

async function handleRun(identity) {
  const smtp = buildTransport();
  if (!smtp.ok) {
    return json(200, {
      sent: 0, failed: 0, claimed: 0,
      smtpConfigured: false,
      message:
        "Es ist kein Postausgang eingerichtet (SMTP_HOST, SMTP_FROM). " +
        "Die Nachrichten bleiben in der Warteschlange, bis er eingetragen ist.",
    });
  }

  const claimed = await rpc("notify_claim", { p_limit: BATCH });
  if (!claimed.ok) {
    return json(502, { code: "DB_UNREACHABLE", message: "Die Warteschlange ist nicht erreichbar." });
  }
  const rows = Array.isArray(claimed.data) ? claimed.data : [];
  if (rows.length === 0) {
    return json(200, { sent: 0, failed: 0, claimed: 0, message: "Nichts zu versenden." });
  }

  let sent = 0, failed = 0;
  for (const row of rows) {
    try {
      await smtp.transport.sendMail({
        from: smtp.from,
        to: row.recipient,
        subject: row.subject,
        text: row.body,
      });
      // Sofort quittieren, nicht am Ende: Bricht der Lauf danach ab, gilt
      // diese Nachricht bereits als zugestellt und geht nicht erneut raus.
      await rpc("notify_settle", { p_id: row.id, p_ok: true, p_max_attempts: MAX_ATTEMPTS });
      sent++;
    } catch (error) {
      const reason = String(error?.message ?? error?.code ?? "unbekannt").slice(0, 300);
      // Die Adresse steht bewusst NICHT im Protokoll – sie ist ein
      // personenbezogenes Datum, und für die Fehlersuche genügt der Grund.
      console.warn("[notify] Versand fehlgeschlagen:", error?.code ?? error?.name ?? "unknown");
      await rpc("notify_settle", {
        p_id: row.id, p_ok: false, p_error: reason, p_max_attempts: MAX_ATTEMPTS,
      });
      failed++;
    }
  }

  smtp.transport.close?.();

  await audit({
    identity,
    action: "notify.run",
    targetType: "notification",
    outcome: failed === 0 ? "ok" : "partial",
    detail: { angefasst: rows.length, versendet: sent, gescheitert: failed },
  });

  return json(200, {
    claimed: rows.length, sent, failed, smtpConfigured: true,
    message: failed === 0
      ? `${sent} Nachricht(en) versendet.`
      : `${sent} versendet, ${failed} fehlgeschlagen – wird erneut versucht.`,
  });
}

export const handler = async (event) => {
  const method = String(event?.httpMethod ?? "").toUpperCase();
  const route = requestPath(event).replace(/^.*\/notify/, "").replace(/\/+$/, "") || "/";

  if (method === "OPTIONS") return json(204, {});
  if (!(method === "POST" && route === "/") && !(method === "GET" && route === "/status")) {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: `${method} ${route} wird nicht unterstützt.` });
  }

  const auth = await authorize(event);
  if (!auth.ok) return auth.response;

  try {
    return route === "/status" ? await handleStatus() : await handleRun(auth.identity);
  } catch (error) {
    console.error("[notify] Unerwarteter Fehler:", error?.name ?? "unknown");
    return json(500, { code: "INTERNAL_ERROR", message: "Unerwarteter Fehler." });
  }
};
