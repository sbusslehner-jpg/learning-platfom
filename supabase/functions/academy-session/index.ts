// ============================================================
// Edge Function: academy-session
// Session-Status (§5.4), Verlängerung (§5.3) und Logout (§5.5).
// Erwartet das __Host-ga_session-Cookie; zustandsändernde Aktionen
// zusätzlich das CSRF-Token (Double-Submit).
//
// ⚠️  In dieser Umgebung NICHT ausgeführt (keine Deno-Runtime).
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  sha256Hex, extendSession, SECURITY_HEADERS, DEFAULT_TIMEOUTS,
} from "../_shared/sso.ts";

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS, ...extra },
  });
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("Cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // status | extend | logout
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const sessionToken = readCookie(req, "__Host-ga_session");
  if (!sessionToken) return json(401, { authenticated: false });

  const sessionHash = await sha256Hex(sessionToken);
  const { data: session } = await sb.from("academy_session").select("*").eq("session_hash", sessionHash).is("revoked_at", null).single();

  const now = Date.now();
  const stillValid = session
    && new Date(session.idle_expires_at).getTime() > now
    && new Date(session.absolute_expires_at).getTime() > now;

  if (!session || !stillValid) return json(401, { authenticated: false, code: "SESSION_EXPIRED" });

  // ── Status ──────────────────────────────────────────────────────────────────
  if (req.method === "GET" && action === "status") {
    return json(200, {
      authenticated: true,
      idleExpiresAt: session.idle_expires_at,
      absoluteExpiresAt: session.absolute_expires_at,
      warningAt: new Date(new Date(session.idle_expires_at).getTime() - DEFAULT_TIMEOUTS.warningMinutes * 60_000).toISOString(),
    });
  }

  // Zustandsändernde Aktionen: CSRF-Double-Submit prüfen (§10.5)
  if (req.method === "POST" && (action === "extend" || action === "logout")) {
    const csrfCookie = readCookie(req, "__Host-ga_csrf");
    const csrfHeader = req.headers.get("X-CSRF-Token");
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return json(403, { code: "CSRF_FAILED", message: "CSRF-Token fehlt oder ungültig" });
    }
    if ((await sha256Hex(csrfCookie)) !== session.csrf_hash) {
      return json(403, { code: "CSRF_FAILED", message: "CSRF-Token ungültig" });
    }
  }

  // ── Verlängern ────────────────────────────────────────────────────────────
  if (req.method === "POST" && action === "extend") {
    const r = extendSession(now, { absoluteExpiresAt: new Date(session.absolute_expires_at).getTime() }, DEFAULT_TIMEOUTS);
    if (!r.ok) return json(401, { code: "SESSION_ABSOLUTE_TIMEOUT", message: "The session cannot be extended." });
    await sb.from("academy_session").update({
      idle_expires_at: new Date(r.idleExpiresAt).toISOString(),
      last_activity_at: new Date(now).toISOString(),
    }).eq("id", session.id);
    return json(200, {
      status: "extended",
      idleExpiresAt: new Date(r.idleExpiresAt).toISOString(),
      absoluteExpiresAt: session.absolute_expires_at,
    });
  }

  // ── Logout: serverseitig invalidieren + Cookies löschen (§5.5) ──────────────
  if (req.method === "POST" && action === "logout") {
    await sb.from("academy_session").update({ revoked_at: new Date(now).toISOString(), revoke_reason: "logout" }).eq("id", session.id);
    const headers = new Headers({ "Content-Type": "application/json", ...SECURITY_HEADERS });
    headers.append("Set-Cookie", "__Host-ga_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
    headers.append("Set-Cookie", "__Host-ga_csrf=; Path=/; Secure; SameSite=Lax; Max-Age=0");
    return new Response(JSON.stringify({ status: "logged_out" }), { status: 200, headers });
  }

  return json(404, { code: "TARGET_NOT_FOUND", message: "Unbekannte Aktion" });
});
