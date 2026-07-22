// ============================================================
// ServiceQ → GITacademy SSO: geteilte Kernlogik (framework-neutral)
//
// Bewusst OHNE Deno- oder Node-spezifische APIs: nur Web-Standards
// (globalThis.crypto, TextEncoder, btoa). Dadurch importierbar sowohl
// von den Deno Edge Functions als auch von den Node-Unit-Tests
// (supabase/functions/_shared/sso.test.ts), die genau diese Logik prüfen.
// ============================================================

// ─── Typen ────────────────────────────────────────────────────────────────────

export type LaunchRequest = {
  issuer?: string;
  subject?: string;
  tenant?: string;
  market?: string;
  locale?: string;
  email?: string;
  displayName?: string;
  roles?: string[];
  organization?: { type?: string; id?: string };
  target?: { type?: string; id?: string };
};

export type ClientConfig = {
  clientId: string;
  allowedTenants: string[];
  allowedRoles: string[];
  allowedTargetTypes: string[];
  defaultRole: string;
  denyUnknownRole: boolean;
  roleMap: Record<string, string>;
};

export type SessionTimeouts = { idleMinutes: number; absoluteHours: number; warningMinutes: number };

// ─── Konstanten ───────────────────────────────────────────────────────────────

export const LAUNCH_TICKET_TTL_SECONDS = 120;

export const DEFAULT_TIMEOUTS: SessionTimeouts = {
  idleMinutes: 30,
  absoluteHours: 12,
  warningMinutes: 5,
};

/** Security-Header für alle SSO-/Auth-Responses (§10.5). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

/** Zusätzliche Header speziell für die Consume-Antwort (§5.2). */
export const CONSUME_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  "Referrer-Policy": "no-referrer",
};

// ─── Krypto-Helfer (Web-Crypto, in Deno & Node vorhanden) ────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Kryptografisch zufälliges, opaques Token (Default 256 bit) als base64url. */
export function generateOpaqueToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 als Hex — für die gehashte Speicherung von Ticket/Session (§10.3). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pseudonymisierte Audit-Referenz: kein Klartext-Subject in Logs (§12.2). */
export async function pseudonymize(externalUserKey: string): Promise<string> {
  return (await sha256Hex("audit:" + externalUserKey)).slice(0, 32);
}

// ─── Benutzerschlüssel (B3 / §6.1) ────────────────────────────────────────────

export function deriveExternalUserKey(issuer: string, tenant: string, subject: string): string {
  return `${issuer}:${tenant}:${subject}`;
}

// ─── Request-Validierung (§5.1 Pflichtfelder + Tenant-Allowlist) ─────────────

export function validateLaunchRequest(
  body: LaunchRequest,
  cfg: Pick<ClientConfig, "allowedTenants" | "allowedTargetTypes">,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const required: (keyof LaunchRequest)[] = ["issuer", "subject", "tenant", "roles", "target"];
  for (const f of required) {
    const v = body[f];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      errors.push(`missing:${String(f)}`);
    }
  }
  if (body.issuer && body.issuer !== "serviceq") errors.push("invalid:issuer");
  if (body.tenant && !cfg.allowedTenants.includes(body.tenant)) errors.push("denied:tenant");
  if (body.target?.type && !cfg.allowedTargetTypes.includes(body.target.type)) errors.push("denied:target_type");
  if (body.target && (!body.target.type || !body.target.id)) errors.push("invalid:target");
  return { ok: errors.length === 0, errors };
}

// ─── Rollen-Mapping (B12 / §6.4) ─────────────────────────────────────────────

/**
 * Bildet ServiceQ-Rollen auf genau EINE Academy-Rolle ab.
 * - Höchste gemappte Rolle gewinnt (Reihenfolge = allowedRoles-Priorität).
 * - Unbekannte Rolle: denyUnknownRole=true → null (Ablehnung),
 *   sonst defaultRole.
 * Gibt null zurück, wenn kein Zugriff gewährt werden darf.
 */
export function mapRole(serviceqRoles: string[], cfg: ClientConfig): string | null {
  const mapped: string[] = [];
  let sawUnknown = false;
  for (const r of serviceqRoles) {
    const academy = cfg.roleMap[r];
    if (academy) mapped.push(academy);
    else sawUnknown = true;
  }
  const allowedMapped = mapped.filter((r) => cfg.allowedRoles.includes(r));
  if (allowedMapped.length > 0) {
    // Priorität = Index in allowedRoles (früher = höher)
    allowedMapped.sort((a, b) => cfg.allowedRoles.indexOf(a) - cfg.allowedRoles.indexOf(b));
    return allowedMapped[0];
  }
  if (sawUnknown && cfg.denyUnknownRole) return null;
  if (cfg.allowedRoles.includes(cfg.defaultRole)) return cfg.defaultRole;
  return null;
}

// ─── Zielauflösung (§8) ───────────────────────────────────────────────────────

export function resolveTarget(
  target: { type?: string; id?: string } | undefined,
  cfg: Pick<ClientConfig, "allowedTargetTypes">,
): { ok: true; type: string; id: string } | { ok: false; reason: string } {
  if (!target || !target.type || !target.id) return { ok: false, reason: "invalid_target" };
  if (/^https?:\/\//i.test(target.id)) return { ok: false, reason: "url_not_allowed" };
  if (!cfg.allowedTargetTypes.includes(target.type)) return { ok: false, reason: "target_type_denied" };
  return { ok: true, type: target.type, id: target.id };
}

/** Interne Pfadauflösung des Ziels (Allowlist-basiert, nie freie URL). */
export function targetToPath(type: string, id: string): string {
  switch (type) {
    case "home": return "/";
    case "training": return `/lernen/${encodeURIComponent(id)}`;
    case "learning_path": return `/katalog/${encodeURIComponent(id)}`;
    default: return "/";
  }
}

// ─── Locale-Fallback (§15) ────────────────────────────────────────────────────

export function resolveLocale(locale: string | undefined, supported: string[], fallback: string): string {
  if (!locale) return fallback;
  const lower = locale.toLowerCase();
  if (supported.includes(lower)) return lower;
  const base = lower.split("-")[0];
  if (supported.includes(base)) return base;
  return fallback;
}

// ─── Session-Laufzeiten (B8/B9 / §7) ─────────────────────────────────────────

export type SessionExpiry = { idleExpiresAt: number; absoluteExpiresAt: number; warningAt: number };

export function computeSessionExpiry(nowMs: number, t: SessionTimeouts = DEFAULT_TIMEOUTS): SessionExpiry {
  const idle = nowMs + t.idleMinutes * 60_000;
  const absolute = nowMs + t.absoluteHours * 3_600_000;
  const idleExpiresAt = Math.min(idle, absolute);
  return {
    idleExpiresAt,
    absoluteExpiresAt: absolute,
    warningAt: idleExpiresAt - t.warningMinutes * 60_000,
  };
}

/**
 * Verlängert die Idle-Frist bei Aktivität — gedeckelt durch das absolute Timeout.
 * Nach Erreichen des absoluten Timeouts ist keine Verlängerung mehr möglich (§5.3).
 */
export function extendSession(
  nowMs: number,
  session: { absoluteExpiresAt: number },
  t: SessionTimeouts = DEFAULT_TIMEOUTS,
): { ok: true; idleExpiresAt: number; warningAt: number } | { ok: false; code: "SESSION_ABSOLUTE_TIMEOUT" } {
  if (nowMs >= session.absoluteExpiresAt) return { ok: false, code: "SESSION_ABSOLUTE_TIMEOUT" };
  const idleExpiresAt = Math.min(nowMs + t.idleMinutes * 60_000, session.absoluteExpiresAt);
  return { ok: true, idleExpiresAt, warningAt: idleExpiresAt - t.warningMinutes * 60_000 };
}

// ─── Client-Assertion-Claims (private_key_jwt, B4 / RFC 9700) ────────────────
// Reine Claim-Prüfung (iss/sub/aud/exp/nbf/iat/jti) mit Uhrzeit-Toleranz.
// Die kryptografische Signaturprüfung erfolgt in der Edge Function (jose);
// hier ist der DB-/Runtime-unabhängige, unit-testbare Teil.

export type ClientAssertionClaims = {
  iss?: string; sub?: string; aud?: string | string[];
  exp?: number; nbf?: number; iat?: number; jti?: string;
};

export function validateClientAssertionClaims(
  claims: ClientAssertionClaims,
  opts: { clientId: string; audience: string; nowSeconds: number; maxLifetimeSeconds?: number; skewSeconds?: number },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const skew = opts.skewSeconds ?? 60;
  const maxLifetime = opts.maxLifetimeSeconds ?? 300;
  const now = opts.nowSeconds;

  if (claims.iss !== opts.clientId) errors.push("iss");
  if (claims.sub !== opts.clientId) errors.push("sub");

  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!auds.includes(opts.audience)) errors.push("aud");

  if (typeof claims.exp !== "number" || claims.exp <= now - skew) errors.push("exp");
  if (typeof claims.nbf === "number" && claims.nbf > now + skew) errors.push("nbf");

  if (typeof claims.iat !== "number") errors.push("iat");
  else {
    if (claims.iat > now + skew) errors.push("iat_future");
    if (now - claims.iat > maxLifetime) errors.push("iat_too_old");
  }

  if (!claims.jti) errors.push("jti");

  return { ok: errors.length === 0, errors };
}

// ─── Fehlerklassifikation (§9.1) ─────────────────────────────────────────────

export const ERROR_CATALOG = {
  INVALID_REQUEST: 400,
  INVALID_CLIENT: 401,
  ACCESS_DENIED: 403,
  TARGET_NOT_FOUND: 404,
  TICKET_ALREADY_USED: 409,
  TICKET_EXPIRED: 410,
  PROVISIONING_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Übersetzt das Ergebnis von classify_launch_ticket() in HTTP-Status + Code. */
export function errorForTicketClassification(classification: string): { status: number; code: ErrorCode } {
  switch (classification) {
    case "already_used": return { status: 409, code: "TICKET_ALREADY_USED" };
    case "expired": return { status: 410, code: "TICKET_EXPIRED" };
    case "not_found": return { status: 404, code: "TARGET_NOT_FOUND" };
    default: return { status: 400, code: "INVALID_REQUEST" };
  }
}
