import { useEffect, useState } from "react";
import { UserManager, WebStorageStateStore, type User, type UserManagerSettings } from "oidc-client-ts";
import { registerSupabaseTokenSource, supabase } from "../../lib/supabase";
import type { Role } from "./roles";

// ============================================================
// Keycloak-Anmeldung (OIDC Authorization Code + PKCE)
//
// Verbindlicher Vertrag: auth/README.md
//   Realm `serviceq`, öffentlicher Client `learning-platform` (kein Secret),
//   Realm-Rollen `admin` | `editor` | `user`, Attribute `markets` + `tenant`,
//   Tokenaustausch über `POST /api/auth/exchange`.
//
// Zwei Betriebsmodi – additiv, der Demo-Betrieb bleibt unberührt:
//
//  • KEYCLOAK-Modus: VITE_KEYCLOAK_URL/-REALM/-CLIENT_ID gesetzt → echte
//    Anmeldung, Rollen aus dem Token, kein Rollenwechsel in der Oberfläche.
//  • DEMO-Modus: Variablen nicht gesetzt → dieses Modul ist vollständig
//    wirkungslos (jede Funktion ist ein No-Op, der Hook liefert sofort
//    "unauthenticated"). Die eingebaute Demo-Anmeldung übernimmt.
//
// ⚠️  Tokens werden NIE protokolliert und NIE in localStorage abgelegt –
//     Ablage ist ausschließlich sessionStorage (Tab-Lebensdauer).
// ============================================================

const rawUrl = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;
const realm = import.meta.env.VITE_KEYCLOAK_REALM as string | undefined;
const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID as string | undefined;

/** true, sobald Keycloak vollständig konfiguriert ist. Build-Zeit-Konstante. */
export const KEYCLOAK_MODE = !!(rawUrl && realm && clientId);

/** Bekannte Realm-Rollen (auth/README.md). Alles andere wird verworfen. */
const KNOWN_ROLES: readonly Role[] = ["admin", "editor", "user"] as const;

/** Netlify-Function auf derselben Domain – kein CORS (auth/README.md). */
const EXCHANGE_ENDPOINT = "/api/auth/exchange";

/** Merker: der Benutzer hat sich bewusst abgemeldet (siehe App.tsx). */
const SIGNED_OUT_KEY = "sq-kc-signed-out";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

export type KeycloakProfile = {
  name: string;
  email: string;
  roles: Role[];
  markets: string[];
  tenant: string | null;
};

// ─── UserManager ─────────────────────────────────────────────────────────────

function buildManager(): UserManager | null {
  if (!KEYCLOAK_MODE || typeof window === "undefined") return null;
  const authority = `${rawUrl!.replace(/\/+$/, "")}/realms/${realm}`;
  const settings: UserManagerSettings = {
    authority,
    client_id: clientId!,
    // Öffentlicher Client: Authorization Code + PKCE. oidc-client-ts erzeugt
    // Verifier/Challenge selbst (PKCE ist bei response_type=code Standard).
    response_type: "code",
    scope: "openid profile email academy",
    redirect_uri: window.location.origin + "/auth/callback",
    post_logout_redirect_uri: window.location.origin + "/login",
    // Stille Erneuerung, damit lange Lerneinheiten nicht mitten im Kapitel
    // abbrechen. oidc-client-ts nutzt bevorzugt das Refresh-Token (ohne
    // iframe); der iframe-Weg über silent_redirect_uri bleibt als Rückfall –
    // `completeLogin()` erkennt den iframe und beantwortet ihn korrekt.
    automaticSilentRenew: true,
    silent_redirect_uri: window.location.origin + "/auth/callback",
    // Tokens gehören NICHT in localStorage (überlebt Tab und andere Tabs).
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    // Session-Iframe-Überwachung ist bei Keycloak + Silent-Renew unnötig
    // und erzeugt in Browsern mit Drittanbieter-Cookie-Blockade nur Rauschen.
    monitorSession: false,
  };
  return new UserManager(settings);
}

const manager: UserManager | null = buildManager();

// ─── Zustand (Modul-Singleton, damit Hook und roles.ts dieselbe Wahrheit sehen) ──

let state: AuthState = KEYCLOAK_MODE ? "loading" : "unauthenticated";
let profile: KeycloakProfile | null = null;
const listeners = new Set<() => void>();

function publish(next: AuthState, nextProfile: KeycloakProfile | null) {
  state = next;
  profile = nextProfile;
  for (const l of listeners) l();
}

/** Aktuelle Rollen aus dem Token – synchron, für roles.ts. */
export function currentProfile(): KeycloakProfile | null {
  return profile;
}

// ─── Token lesen (NUR lesen – Prüfung ist Aufgabe des Servers) ───────────────

type TokenClaims = {
  realm_access?: { roles?: string[] };
  markets?: unknown;
  tenant?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  email?: unknown;
};

/**
 * Dekodiert die Nutzlast eines JWT (mittleres Segment, base64url).
 *
 * ⚠️  Bewusst OHNE Signaturprüfung: im Browser wäre sie wertlos, weil der
 *     Client den Schlüssel nicht vertrauenswürdig halten kann. Verbindlich
 *     geprüft wird serverseitig (`/api/auth/exchange` gegen JWKS) und in der
 *     Datenbank (RLS). Die Claims hier steuern ausschließlich die Ergonomie
 *     der Oberfläche – nie eine Zugriffsentscheidung.
 */
function decodeJwtPayload(token: string): TokenClaims | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    // TextDecoder statt escape/decodeURIComponent: Umlaute in Namen bleiben korrekt.
    return JSON.parse(new TextDecoder().decode(bytes)) as TokenClaims;
  } catch {
    // Kein Tokeninhalt protokollieren.
    return null;
  }
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

function profileFromToken(user: User): KeycloakProfile {
  const claims = decodeJwtPayload(user.access_token) ?? {};
  // Fallback auf die ID-Token-Claims, falls der Access-Token schlanker ist.
  const idClaims = (user.profile ?? {}) as Record<string, unknown>;

  const granted = Array.isArray(claims.realm_access?.roles) ? claims.realm_access!.roles! : [];
  const roles = KNOWN_ROLES.filter((r) => granted.includes(r));

  const marketsRaw = asString(claims.markets) || asString(idClaims.markets);
  const markets = marketsRaw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const tenant = asString(claims.tenant) || asString(idClaims.tenant);

  const name =
    asString(claims.name) ||
    asString(idClaims.name) ||
    asString(claims.preferred_username) ||
    asString(idClaims.preferred_username) ||
    asString(claims.email) ||
    asString(idClaims.email);

  return {
    name,
    email: asString(claims.email) || asString(idClaims.email),
    roles,
    markets,
    tenant: tenant || null,
  };
}

// ─── Supabase-Token: Austausch und Anwendung ─────────────────────────────────

let supabaseToken: string | null = null;
let supabaseTokenExpiresAt: number | null = null;

/**
 * Das ausgetauschte, Supabase-konforme Token (HS256) bzw. `null`.
 *
 * HINWEIS FÜR DIE DATENSCHICHT: `src/lib/supabase.ts` erzeugt den Client
 * einmalig mit dem anon-Key. Die `Authorization`-Kopfzeile eines bereits
 * erzeugten supabase-js-Clients lässt sich nachträglich nicht ersetzen.
 * Damit RLS die echte Identität sieht, müsste der dortige `fetchWithTimeout`
 * dieses Token setzen, etwa:
 *
 *     const t = getSupabaseToken?.();
 *     if (t) headers.set("Authorization", `Bearer ${t}`);
 *
 * Diese Datei bleibt hier absichtlich unberührt – die Datenschicht wird von
 * einem anderen Paket verantwortet. Der Austausch selbst findet statt und das
 * Token ist über diesen Getter abholbar; `applySupabaseSession()` versucht
 * zusätzlich den direkten Weg über `supabase.auth.setSession()`.
 */
export function getSupabaseToken(): string | null {
  if (supabaseTokenExpiresAt && Date.now() >= supabaseTokenExpiresAt) return null;
  return supabaseToken;
}

// Die Datenschicht holt das ausgetauschte Token bei jeder Anfrage hier ab.
// Damit sieht RLS (Migration 0005) die echte Identität statt des anon-Keys.
registerSupabaseTokenSource(getSupabaseToken);

/**
 * Legt das ausgetauschte Token auf den Supabase-Client.
 *
 * `setSession()` erwartet normalerweise ein Refresh-Token. Wir haben keins –
 * die Erneuerung läuft über Keycloak, nicht über Supabase. Schlägt der Aufruf
 * deshalb fehl, bleibt der Realtime-Kanal (`realtime.setAuth`) als Weg, den
 * die Bibliothek ohne Refresh-Token akzeptiert; für REST-Abfragen greift dann
 * der oben dokumentierte Getter.
 *
 * @returns true, wenn supabase-js die Sitzung übernommen hat.
 */
export async function applySupabaseSession(token: string): Promise<boolean> {
  supabaseToken = token;
  if (!supabase) return false;
  try {
    const { error } = await supabase.auth.setSession({ access_token: token, refresh_token: "" });
    if (error) throw error;
    return true;
  } catch {
    try {
      supabase.realtime?.setAuth?.(token);
    } catch {
      /* Realtime nicht verfügbar – REST läuft über getSupabaseToken(). */
    }
    return false;
  }
}

function readExpiry(value: unknown): number | null {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value; // s oder ms
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber < 1e12 ? asNumber * 1000 : asNumber;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Keycloak-Token → Supabase-Token (auth/README.md, Schritt 5). */
async function exchangeForSupabase(keycloakToken: string): Promise<void> {
  try {
    const res = await fetch(EXCHANGE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${keycloakToken}`, Accept: "application/json" },
    });
    if (!res.ok) {
      // Kein Token protokollieren – nur der Statuscode ist diagnostisch nützlich.
      console.warn(`[auth] Tokenaustausch fehlgeschlagen (HTTP ${res.status}).`);
      return;
    }
    const body = (await res.json()) as { token?: string; expiresAt?: unknown };
    if (!body?.token) {
      console.warn("[auth] Tokenaustausch ohne Token in der Antwort.");
      return;
    }
    supabaseTokenExpiresAt = readExpiry(body.expiresAt);
    await applySupabaseSession(body.token);
  } catch {
    // Netzwerkfehler oder Function nicht bereitgestellt: die Oberfläche bleibt
    // nutzbar, Datenabfragen laufen dann mit dem anon-Key bzw. Demo-Fallback.
    console.warn("[auth] Tokenaustausch nicht erreichbar.");
  }
}

// ─── Benutzer übernehmen ─────────────────────────────────────────────────────

let lastExchangedToken: string | null = null;

async function adoptUser(user: User | null): Promise<void> {
  if (!user?.access_token) {
    publish("unauthenticated", null);
    return;
  }
  publish("authenticated", profileFromToken(user));
  // Nach Anmeldung UND nach jeder stillen Erneuerung neu austauschen,
  // damit das Supabase-Token nicht vor dem Keycloak-Token verfällt.
  if (user.access_token !== lastExchangedToken) {
    lastExchangedToken = user.access_token;
    await exchangeForSupabase(user.access_token);
  }
}

let bootstrapped = false;

/** Einmalig: Ereignisse verdrahten und eine vorhandene Sitzung übernehmen. */
function bootstrap(): void {
  if (!manager || bootstrapped) return;
  bootstrapped = true;

  // Stille Erneuerung liefert einen neuen Access-Token → erneut austauschen.
  manager.events.addUserLoaded((user) => { void adoptUser(user); });
  // Während einer laufenden Abmeldung NICHT umschalten: `signoutRedirect()`
  // entfernt den Benutzer, bevor es navigiert. Ein sofortiges
  // "unauthenticated" würde den automatischen Absprung zur Anmeldung auslösen
  // und die Abmeldung überholen (Rundlauf direkt zurück in die Sitzung).
  manager.events.addUserUnloaded(() => { if (!signingOut) publish("unauthenticated", null); });
  manager.events.addSilentRenewError(() => {
    console.warn("[auth] Stille Erneuerung fehlgeschlagen.");
  });

  manager
    .getUser()
    .then(async (user) => {
      if (user && !user.expired) { await adoptUser(user); return; }
      if (user) {
        // Abgelaufen, aber Refresh-Token vorhanden: still erneuern.
        try { await adoptUser(await manager.signinSilent()); return; }
        catch { /* fällt unten auf "unauthenticated" */ }
      }
      publish("unauthenticated", null);
    })
    .catch(() => publish("unauthenticated", null));
}

if (KEYCLOAK_MODE) bootstrap();

// ─── Öffentliche Aktionen (No-Op im Demo-Modus) ──────────────────────────────

let redirecting = false;
let signingOut = false;

/** Weiterleitung zur Keycloak-Anmeldeseite. */
export async function login(): Promise<void> {
  // `signingOut`: eine laufende Abmeldung darf nicht von einer neuen Anmeldung
  // überholt werden (siehe addUserUnloaded in bootstrap()).
  if (!manager || redirecting || signingOut) return;
  redirecting = true;
  try {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch { /* ignorieren */ }
  try {
    await manager.signinRedirect();
  } catch {
    redirecting = false;
    console.warn("[auth] Anmeldung konnte nicht gestartet werden.");
    throw new Error("signin-redirect-failed");
  }
}

let completing: Promise<void> | null = null;

/**
 * Verarbeitet die Rückleitung auf `/auth/callback`.
 * Mehrfachaufrufe (Re-Render, StrictMode) teilen dieselbe Zusage – der
 * Autorisierungscode ist nur einmal einlösbar.
 */
export function completeLogin(): Promise<void> {
  if (!manager) return Promise.resolve();
  // Stille Erneuerung lädt dieselbe Adresse in einem versteckten iframe.
  // Dort darf NICHT der Anmeldecode eingelöst werden – nur die Antwort an
  // das übergeordnete Fenster gemeldet werden.
  if (typeof window !== "undefined" && window.self !== window.top) {
    return manager.signinSilentCallback().then(() => undefined);
  }
  if (completing) return completing;
  completing = manager
    .signinRedirectCallback()
    .then((user) => adoptUser(user))
    .catch((err) => {
      publish("unauthenticated", null);
      // Nur den Fehlertyp weitergeben, nie Token oder Code.
      throw new Error(err instanceof Error ? err.message : "signin-callback-failed");
    });
  return completing;
}

/** Abmelden bei Keycloak (Single Logout) inklusive lokaler Aufräumarbeiten. */
export async function logout(): Promise<void> {
  supabaseToken = null;
  supabaseTokenExpiresAt = null;
  lastExchangedToken = null;
  if (!manager) return;
  signingOut = true;
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch { /* ignorieren */ }
  try {
    await supabase?.auth.signOut({ scope: "local" });
  } catch { /* lokale Supabase-Sitzung war ggf. nie gesetzt */ }
  try {
    await manager.signoutRedirect();
  } catch {
    signingOut = false;
    console.warn("[auth] Abmeldung konnte nicht gestartet werden.");
    publish("unauthenticated", null);
  }
}

/** true, wenn der Benutzer sich bewusst abgemeldet hat (kein Auto-Absprung). */
export function signedOutDeliberately(): boolean {
  if (!KEYCLOAK_MODE) return false;
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Aktueller Keycloak-Access-Token oder `null`.
 * Ist er abgelaufen, wird einmal still erneuert.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!manager) return null;
  try {
    let user = await manager.getUser();
    if (!user) return null;
    if (user.expired) user = await manager.signinSilent();
    return user?.access_token ?? null;
  } catch {
    return null;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Anmeldezustand und Profil aus dem Token.
 * Im Demo-Modus ein No-Op: sofort "unauthenticated" mit `profile === null`.
 */
export function useKeycloakAuth(): { state: AuthState; profile: KeycloakProfile | null } {
  const [snapshot, setSnapshot] = useState(() => ({ state, profile }));

  useEffect(() => {
    if (!KEYCLOAK_MODE) return;
    const l = () => setSnapshot({ state, profile });
    listeners.add(l);
    l(); // Zustand könnte sich zwischen Render und Effekt geändert haben.
    return () => { listeners.delete(l); };
  }, []);

  return snapshot;
}
