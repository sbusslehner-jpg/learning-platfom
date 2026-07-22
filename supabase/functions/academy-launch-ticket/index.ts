// ============================================================
// Edge Function: academy-launch-ticket
// Erstellt ein One-Time-Launch-Ticket (§5.1). Aufrufer: ServiceQ-Backend
// (Systemauthentifizierung). Antwort: launchUrl + expiresAt.
//
// ⚠️  In dieser Umgebung NICHT ausgeführt (keine Deno-Runtime). Die
//     reine Entscheidungslogik ist über supabase/functions/_shared/sso.ts
//     unit-getestet; der HTTP-/DB-Pfad benötigt eine Supabase-Umgebung.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  validateLaunchRequest, mapRole, resolveTarget, resolveLocale,
  deriveExternalUserKey, generateOpaqueToken, sha256Hex, pseudonymize,
  LAUNCH_TICKET_TTL_SECONDS, SECURITY_HEADERS, type ClientConfig, type LaunchRequest,
} from "../_shared/sso.ts";

const SUPPORTED_LOCALES = ["de", "en", "fr", "pl", "it", "es", "nl", "cs", "pt", "el", "hu", "sv"];

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS, ...extra },
  });
}

async function audit(sb: any, e: Record<string, unknown>) {
  try { await sb.from("sso_audit").insert(e); } catch { /* Audit darf den Flow nie brechen */ }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { code: "INVALID_REQUEST", message: "POST erwartet" });

  const correlationId = req.headers.get("X-Correlation-ID") ?? crypto.randomUUID();
  const idempotencyKey = req.headers.get("Idempotency-Key");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── 1. Systemauthentifizierung des ServiceQ-Clients ─────────────────────────
  // [Annahme A2] Zielverfahren ist private_key_jwt (RFC 9700). Hier ist der
  // client_secret-Pfad implementiert; der JWT-Pfad ist als Erweiterungspunkt
  // markiert und MUSS vor Produktivbetrieb ergänzt werden (B4).
  const authz = req.headers.get("Authorization") ?? "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!bearer) return json(401, { code: "INVALID_CLIENT", message: "Systemauthentifizierung fehlt" });

  const clientId = req.headers.get("X-Client-Id") ?? "";
  const { data: client } = await sb.from("sso_client").select("*").eq("client_id", clientId).eq("enabled", true).single();
  if (!client) {
    await audit(sb, { event_type: "SSO_SYSTEM_LOGIN", result: "DENIED", client_id: clientId, correlation_id: correlationId });
    return json(401, { code: "INVALID_CLIENT", message: "Client unbekannt oder deaktiviert" });
  }

  let clientOk = false;
  if (client.auth_method === "client_secret" && client.client_secret_hash) {
    clientOk = (await sha256Hex(bearer)) === client.client_secret_hash;
  } else if (client.auth_method === "private_key_jwt") {
    // TODO(B4): Client-Assertion-JWT gegen client.public_key_pem verifizieren
    //   (Signatur, iss, sub=client_id, aud=diese URL, exp/nbf/iat, jti-Replay-Sperre).
    //   Bis dahin bewusst FAIL-CLOSED:
    clientOk = false;
  }
  if (!clientOk) {
    await audit(sb, { event_type: "SSO_SYSTEM_LOGIN", result: "DENIED", client_id: clientId, correlation_id: correlationId });
    return json(401, { code: "INVALID_CLIENT", message: "Systemauthentifizierung ungültig" });
  }

  // ── 2. Request validieren ───────────────────────────────────────────────────
  let body: LaunchRequest;
  try { body = await req.json(); } catch { return json(400, { code: "INVALID_REQUEST", message: "Body ungültig" }); }

  const cfg: ClientConfig = {
    clientId: client.client_id,
    allowedTenants: client.allowed_tenants ?? [],
    allowedRoles: client.allowed_roles ?? [],
    allowedTargetTypes: client.allowed_target_types ?? [],
    defaultRole: client.default_role ?? "learner",
    denyUnknownRole: false,
    roleMap: {},
  };
  const { data: roleRows } = await sb.from("sso_role_map").select("serviceq_role, academy_role").eq("client_id", clientId);
  for (const r of roleRows ?? []) cfg.roleMap[r.serviceq_role] = r.academy_role;

  const v = validateLaunchRequest(body, cfg);
  if (!v.ok) {
    if (v.errors.some((e) => e.startsWith("denied:")))
      return json(403, { code: "ACCESS_DENIED", message: "Mandant oder Ziel nicht erlaubt", correlationId });
    return json(400, { code: "INVALID_REQUEST", message: "Pflichtfeld fehlt oder ungültig", details: v.errors, correlationId });
  }

  // ── 3. Rolle & Ziel mappen ──────────────────────────────────────────────────
  const academyRole = mapRole(body.roles!, cfg);
  if (!academyRole) return json(403, { code: "ACCESS_DENIED", message: "Rolle nicht zugelassen", correlationId });

  const t = resolveTarget(body.target, cfg);
  if (!t.ok) return json(403, { code: "ACCESS_DENIED", message: "Ziel nicht zugelassen", correlationId });

  const locale = resolveLocale(body.locale, SUPPORTED_LOCALES, "en");
  const externalKey = deriveExternalUserKey(body.issuer!, body.tenant!, body.subject!);

  // ── 4. Idempotenz (B5) ──────────────────────────────────────────────────────
  if (idempotencyKey) {
    const { data: existing } = await sb.from("launch_ticket")
      .select("id, expires_at, status").eq("client_id", clientId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing && existing.status === "unused" && new Date(existing.expires_at) > new Date()) {
      // Kein neues Ticket: dasselbe Ergebnis (Code selbst nicht rekonstruierbar → neues Ausstellen
      // wäre nötig; hier bewusst 409, um Doppelausgabe zu vermeiden). Verhalten dokumentiert.
      return json(409, { code: "TICKET_ALREADY_USED", message: "Ticket zu diesem Idempotency-Key existiert bereits", correlationId });
    }
  }

  // ── 5. JIT-Provisioning (B3/§6.2) ───────────────────────────────────────────
  const { data: user, error: provErr } = await sb.from("app_user").upsert({
    issuer: body.issuer, tenant: body.tenant, subject: body.subject,
    name: body.displayName ?? null, email: body.email ?? null, ui_language: locale,
  }, { onConflict: "issuer,tenant,subject" }).select("id").single();
  if (provErr || !user) {
    await audit(sb, { event_type: "SSO_PROVISIONING", result: "ERROR", client_id: clientId, tenant: body.tenant, correlation_id: correlationId });
    return json(422, { code: "PROVISIONING_FAILED", message: "Benutzer konnte nicht angelegt werden", correlationId });
  }

  // ── 6. Ticket erzeugen (nur Hash speichern, §10.3) ──────────────────────────
  const code = generateOpaqueToken(32);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + LAUNCH_TICKET_TTL_SECONDS * 1000).toISOString();

  const { error: insErr } = await sb.from("launch_ticket").insert({
    code_hash: codeHash, client_id: clientId, app_user_id: user.id,
    issuer: body.issuer, tenant: body.tenant, subject: body.subject,
    external_user_key: externalKey, market: body.market ?? null, locale,
    roles: [academyRole], target_type: t.type, target_id: t.id,
    idempotency_key: idempotencyKey, correlation_id: correlationId, expires_at: expiresAt,
  });
  if (insErr) return json(500, { code: "INTERNAL_ERROR", message: "Ticket konnte nicht gespeichert werden", correlationId });

  await audit(sb, {
    event_type: "SSO_TICKET_CREATED", result: "SUCCESS", client_id: clientId, tenant: body.tenant,
    subject_reference: await pseudonymize(externalKey), target_type: t.type, target_id: t.id, correlation_id: correlationId,
  });

  const base = Deno.env.get("ACADEMY_PUBLIC_URL") ?? "https://academy.example.com";
  return json(201, {
    launchUrl: `${base}/functions/v1/academy-consume?code=${code}`,
    expiresAt,
    correlationId,
  }, { "Cache-Control": "no-store" });
});
