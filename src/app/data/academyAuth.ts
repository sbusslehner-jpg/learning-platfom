import { useEffect, useState } from "react";

// ============================================================
// Auth-Strategie der GITacademy
//
// Zwei Modi, additiv – der bestehende Demo-Betrieb bleibt unberührt:
//
//  • DEMO-Modus (Default): kein VITE_ACADEMY_SESSION_URL gesetzt → die SPA
//    nutzt weiterhin die eingebaute Demo-Anmeldung (loggedIn-Boolean).
//
//  • SSO-Modus: VITE_ACADEMY_SESSION_URL gesetzt (z. B. "/sso/session" bei
//    Ein-Domain-Betrieb) → die SPA prüft beim Start die echte, serverseitige
//    Academy-Session (academy-session/status). Kein eigener Login; bei fehlender
//    Session Weiterleitung auf /sso/expired, NIE auf eine Loginseite.
// ============================================================

const SESSION_BASE = import.meta.env.VITE_ACADEMY_SESSION_URL as string | undefined;

/** true, sobald ein Session-Endpunkt konfiguriert ist. */
export const SSO_MODE = !!SESSION_BASE;

export type AuthState = "loading" | "authenticated" | "unauthenticated";

/**
 * Prüft im SSO-Modus einmalig den serverseitigen Sessionstatus.
 * Im Demo-Modus ist der Hook ein No-Op und liefert sofort "unauthenticated"
 * (die Demo-Anmeldung übernimmt dann die Freischaltung in App.tsx).
 */
export function useAcademyAuth(): AuthState {
  const [state, setState] = useState<AuthState>(SSO_MODE ? "loading" : "unauthenticated");

  useEffect(() => {
    if (!SESSION_BASE) return;
    let alive = true;
    fetch(`${SESSION_BASE}/status`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((s) => { if (alive) setState(s?.authenticated ? "authenticated" : "unauthenticated"); })
      .catch(() => { if (alive) setState("unauthenticated"); });
    return () => { alive = false; };
  }, []);

  return state;
}
