// ============================================================
// POST /api/auth/exchange
//
// Tauscht ein verifiziertes Keycloak-Access-Token gegen ein kurzlebiges,
// Supabase-konformes JWT (HS256). Grund: Supabase-RLS verifiziert JWTs mit
// dem Projekt-Secret, Keycloak signiert asymmetrisch. Diese Funktion ist
// die einzige Stelle, die beide Welten verbindet – sie ist damit auch die
// einzige Stelle, an der eine Fehlprüfung zu einer fremden Identität führt.
//
// Vertrag: auth/README.md
// ============================================================

import { SignJWT } from "jose";
import { json } from "./_lib/http.mjs";
import { verifyKeycloakToken } from "./_lib/keycloak.mjs";
import { upsertAppUser } from "./_lib/supabase.mjs";
import { allow, audit, clientIp, tooManyRequests } from "./_lib/guard.mjs";

/** Lebensdauer des ausgestellten Supabase-Tokens (Sekunden). */
const SUPABASE_TOKEN_TTL_SECONDS = 15 * 60;

/** Ausstellerkennung des selbst signierten Tokens. */
const TOKEN_ISSUER = "keycloak-exchange";

export const handler = async (event) => {
  if (String(event?.httpMethod ?? "").toUpperCase() !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Nur POST ist erlaubt." }, { Allow: "POST" });
  }

  // R-13: Der Austausch ist der einzige Einstieg, der ohne vorher geprueftes
  // Token erreicht wird, und loest je Aufruf eine JWKS- sowie eine
  // Datenbankoperation aus. 60 Aufrufe je Minute und IP liegen weit ueber dem,
  // was eine normale Sitzung braucht - der Keycloak-Token lebt fuenf Minuten.
  const ip = clientIp(event?.headers);
  if (!(await allow(`exchange:${ip}`, 60, 60))) {
    console.warn("[auth-exchange] Rate-Limit erreicht.");
    return tooManyRequests(60);
  }

  const jwtSecret = String(process.env.SUPABASE_JWT_SECRET ?? "");
  if (jwtSecret === "") {
    // Ohne Secret könnte nur ein unsigniertes/„leer signiertes“ Token
    // entstehen – lieber hart abbrechen als ein wertloses Token ausliefern.
    console.error("[auth-exchange] SUPABASE_JWT_SECRET fehlt.");
    return json(500, { code: "CONFIG_ERROR", message: "Token-Signierung ist nicht konfiguriert." });
  }

  // ── 1. Keycloak-Token prüfen (gemeinsame Implementierung) ──────────────────
  const verified = await verifyKeycloakToken(event?.headers);
  if (!verified.ok) {
    return json(verified.status, { code: verified.code, message: verified.message });
  }
  const identity = verified.identity;

  // ── 2. app_user spiegeln ──────────────────────────────────────────────────
  const upsert = await upsertAppUser({
    issuer: "keycloak",
    tenant: identity.tenant,
    subject: identity.sub,
    name: identity.name,
    email: identity.email,
  });

  if (!upsert.ok) {
    // Fail closed: Die RLS-Schreibregeln prüfen teils nur Rollenclaims.
    // Ein Token mit Keycloak-sub statt app_user.id wäre deshalb keineswegs
    // überall "leer", sondern könnte trotz fehlendem Profil Inhalte ändern.
    console.error("[auth-exchange] app_user-Provisionierung fehlgeschlagen:", upsert.code);
    return json(503, {
      code: "PROVISIONING_FAILED",
      message: "Das Benutzerprofil konnte nicht bereitgestellt werden. Bitte später erneut versuchen.",
    });
  }

  // In der Plattform deaktivierte Konten dürfen kein Zugriffstoken erhalten.
  if (upsert.active === false) {
    // R-10: Eine abgewiesene Anmeldung eines gesperrten Kontos ist genau das,
    // was spaeter jemand nachvollziehen will.
    void audit({
      identity: { ...identity, appUserId: upsert.id },
      action: "login.denied",
      targetType: "app_user",
      targetId: upsert.id,
      outcome: "denied",
      detail: { reason: "account_disabled" },
    });
    return json(403, {
      code: "ACCOUNT_DISABLED",
      message: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an Ihre Administration.",
    });
  }
  // `sub` MUSS die app_user-UUID sein: die RLS-Policies vergleichen
  // `auth.uid()` mit `app_user.id`.
  const subject = upsert.id;

  // ── 3. Supabase-Token signieren ───────────────────────────────────────────
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Das ausgestellte Token darf NIE länger gültig sein als das Keycloak-Token,
  // aus dem es abgeleitet ist – sonst überlebt der Zugriff den Widerruf
  // (Logout, Deaktivierung) in Keycloak.
  const ttlExpiry = nowSeconds + SUPABASE_TOKEN_TTL_SECONDS;
  const expiresAt = identity.exp ? Math.min(ttlExpiry, identity.exp) : ttlExpiry;

  let token;
  try {
    token = await new SignJWT({
      role: "authenticated",
      email: identity.email ?? undefined,
      // Eigene Claims für die RLS-Policies (auth.jwt() -> ...).
      academy_roles: identity.roles,
      markets: identity.markets,
      tenant: identity.tenant,
      keycloak_sub: identity.sub,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(subject)
      .setAudience("authenticated")
      .setIssuer(TOKEN_ISSUER)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAt)
      .sign(new TextEncoder().encode(jwtSecret));
  } catch (error) {
    // Fehlermeldung könnte Schlüsselmaterial-Hinweise enthalten – nur Name loggen.
    console.error("[auth-exchange] Signierung fehlgeschlagen:", error?.name ?? "unknown");
    return json(500, { code: "SIGNING_FAILED", message: "Token konnte nicht ausgestellt werden." });
  }

  return json(200, {
    token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    profile: {
      name: identity.name,
      email: identity.email,
      roles: identity.roles,
      markets: identity.markets,
      tenant: identity.tenant,
    },
    provisioned: true,
  });
};
