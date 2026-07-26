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

/** Lebensdauer des ausgestellten Supabase-Tokens (Sekunden). */
const SUPABASE_TOKEN_TTL_SECONDS = 15 * 60;

/** Ausstellerkennung des selbst signierten Tokens. */
const TOKEN_ISSUER = "keycloak-exchange";

export const handler = async (event) => {
  if (String(event?.httpMethod ?? "").toUpperCase() !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED", message: "Nur POST ist erlaubt." }, { Allow: "POST" });
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
  // Fehler hier brechen die Anmeldung NICHT ab (Vertrag), werden aber über
  // `provisioned: false` sichtbar gemacht.
  let provisioned = false;
  let subject = identity.sub;
  let provisioningCode = null;

  const upsert = await upsertAppUser({
    issuer: "keycloak",
    tenant: identity.tenant,
    subject: identity.sub,
    name: identity.name,
    email: identity.email,
  });

  if (upsert.ok) {
    // In der Plattform deaktivierte Konten dürfen kein Zugriffstoken erhalten.
    // Ohne diese Prüfung wäre die Aktiv/Inaktiv-Umschaltung der Verwaltung
    // wirkungslos: Keycloak kennt das Flag nicht und stellt weiter Tokens aus.
    // Der Zugriff endet damit spätestens mit dem Ablauf des aktuellen Tokens
    // (15 Minuten); für sofortiges Sperren zusätzlich in Keycloak deaktivieren.
    if (upsert.active === false) {
      return json(403, {
        code: "ACCOUNT_DISABLED",
        message: "Dieses Konto ist deaktiviert. Bitte wenden Sie sich an Ihre Administration.",
      });
    }
    provisioned = true;
    // `sub` MUSS die app_user-UUID sein: die RLS-Policies vergleichen
    // `auth.uid()` mit `app_user.id`.
    subject = upsert.id;
  } else {
    provisioningCode = upsert.code;
    // Rückfallebene: die Keycloak-UUID. Damit ist die Anmeldung möglich,
    // RLS-Abfragen auf app_user.id treffen aber (bewusst) keine Zeile –
    // der Benutzer sieht keine personalisierten Daten, statt versehentlich
    // die Daten eines fremden Kontos zu sehen.
    console.warn("[auth-exchange] app_user-Provisionierung fehlgeschlagen:", provisioningCode);
  }

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
    provisioned,
    ...(provisioned
      ? {}
      : {
          message:
            "Anmeldung erfolgreich, aber das Benutzerprofil konnte nicht mit der Datenbank abgeglichen werden.",
        }),
  });
};
