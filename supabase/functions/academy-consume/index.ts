// ============================================================
// Edge Function: academy-consume
// Löst das Launch-Ticket ATOMAR ein (§5.2), erstellt die Academy-Session,
// setzt ein opaques HttpOnly-Cookie und leitet per 303 ohne Code weiter.
//
// ⚠️  In dieser Umgebung NICHT ausgeführt (keine Deno-Runtime).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  generateOpaqueToken, sha256Hex, pseudonymize, computeSessionExpiry,
  targetToPath, errorForTicketClassification, CONSUME_HEADERS, DEFAULT_TIMEOUTS,
} from "../_shared/sso.ts";

function errorRedirect(base: string, kind: "invalid" | "denied" | "error", correlationId: string) {
  // Weiterleitung auf die Fehlerseite der SPA — NIEMALS auf eine Loginseite.
  const url = `${base}/sso/error?reason=${kind}&ref=${encodeURIComponent(correlationId)}`;
  return new Response(null, { status: 303, headers: { Location: url, ...CONSUME_HEADERS } });
}

async function audit(sb: any, e: Record<string, unknown>) {
  try { await sb.from("sso_audit").insert(e); } catch { /* nie den Flow brechen */ }
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  const spaBase = Deno.env.get("ACADEMY_SPA_URL") ?? "https://academy.example.com";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Code aus Form-POST (bevorzugt) oder GET-Query (§5.2).
  let code = "";
  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    code = (form?.get("code") as string) ?? "";
  } else if (req.method === "GET") {
    code = new URL(req.url).searchParams.get("code") ?? "";
  } else {
    return new Response("Method Not Allowed", { status: 405, headers: CONSUME_HEADERS });
  }
  if (!code) return errorRedirect(spaBase, "invalid", correlationId);

  const codeHash = await sha256Hex(code);

  // ── Atomare Einlösung: genau ein UPDATE dreht 'unused'→'used' ────────────────
  const { data: consumed, error: rpcErr } = await sb.rpc("consume_launch_ticket", { p_code_hash: codeHash });
  const ticket = Array.isArray(consumed) ? consumed[0] : consumed;

  if (rpcErr) return errorRedirect(spaBase, "error", correlationId);

  if (!ticket) {
    // Fehlgeschlagen → klassifizieren (already_used / expired / not_found)
    const { data: classification } = await sb.rpc("classify_launch_ticket", { p_code_hash: codeHash });
    const { code: errCode } = errorForTicketClassification(String(classification ?? "not_found"));
    await audit(sb, { event_type: "SSO_TICKET_CONSUME_FAILED", result: "DENIED", meta: { reason: errCode }, correlation_id: correlationId });
    return errorRedirect(spaBase, errCode === "TICKET_EXPIRED" ? "invalid" : "invalid", correlationId);
  }

  // ── Session erzeugen + Session-ID rotieren (§7.2) ───────────────────────────
  const now = Date.now();
  const exp = computeSessionExpiry(now, DEFAULT_TIMEOUTS);
  const sessionToken = generateOpaqueToken(32);
  const csrfToken = generateOpaqueToken(32);
  const academyRole = Array.isArray(ticket.roles) ? ticket.roles[0] : "learner";

  const { error: sErr } = await sb.from("academy_session").insert({
    session_hash: await sha256Hex(sessionToken),
    csrf_hash: await sha256Hex(csrfToken),
    app_user_id: ticket.app_user_id ?? (await resolveUserId(sb, ticket.external_user_key)),
    client_id: ticket.client_id, tenant: ticket.tenant, market: ticket.market, locale: ticket.locale,
    academy_role: academyRole,
    created_at: new Date(now).toISOString(),
    last_activity_at: new Date(now).toISOString(),
    idle_expires_at: new Date(exp.idleExpiresAt).toISOString(),
    absolute_expires_at: new Date(exp.absoluteExpiresAt).toISOString(),
  });
  if (sErr) return errorRedirect(spaBase, "error", correlationId);

  await audit(sb, {
    event_type: "SSO_TICKET_CONSUMED", result: "SUCCESS", client_id: ticket.client_id, tenant: ticket.tenant,
    subject_reference: await pseudonymize(ticket.external_user_key), target_type: ticket.target_type,
    target_id: ticket.target_id, correlation_id: correlationId,
  });

  // ── Cookies + 303 auf internes Ziel (ohne Code in der URL) ──────────────────
  const dest = `${spaBase}${targetToPath(ticket.target_type, ticket.target_id)}`;
  const headers = new Headers({ Location: dest, ...CONSUME_HEADERS });
  const maxAge = Math.floor((exp.absoluteExpiresAt - now) / 1000);
  // __Host- Cookie: kein Domain-Attribut, Path=/, Secure (§7.1)
  headers.append("Set-Cookie", `__Host-ga_session=${sessionToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
  // CSRF-Token per Double-Submit (nicht HttpOnly, damit die SPA es spiegeln kann)
  headers.append("Set-Cookie", `__Host-ga_csrf=${csrfToken}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  return new Response(null, { status: 303, headers });
});

async function resolveUserId(sb: any, externalKey: string): Promise<string | null> {
  const [issuer, tenant, subject] = externalKey.split(":");
  const { data } = await sb.from("app_user").select("id").match({ issuer, tenant, subject }).single();
  return data?.id ?? null;
}
