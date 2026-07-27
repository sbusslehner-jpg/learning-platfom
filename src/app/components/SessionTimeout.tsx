import { useCallback, useEffect, useRef, useState } from "react";
import { KEYCLOAK_MODE, logout as keycloakLogout } from "../data/keycloakAuth";

// ============================================================
// Session-Timeout-Modal (§7.5) — Referenzkomponente
//
// Pollt den serverseitigen Sessionstatus und zeigt 5 Minuten vor dem
// Idle-Timeout ein a11y-konformes Warn-Modal mit sekundengenauem
// Countdown, "Sitzung verlängern" und "Abmelden".
//
// Sicher als No-Op: Ohne konfigurierte Endpunkt-Basis (VITE_ACADEMY_SESSION_URL)
// rendert die Komponente nichts und stört den bestehenden Demo-Betrieb nicht.
// ============================================================

const SESSION_BASE = import.meta.env.VITE_ACADEMY_SESSION_URL as string | undefined;
const POLL_MS = 30_000;
const KEYCLOAK_IDLE_MS = 30 * 60_000;
const KEYCLOAK_WARNING_MS = 5 * 60_000;

type Status = {
  authenticated: boolean;
  idleExpiresAt?: string;
  absoluteExpiresAt?: string;
  warningAt?: string;
};

// Minimale i18n (Fallback en); produktiv aus dem i18n-System der Academy.
const T: Record<string, Record<string, string>> = {
  de: {
    title: "Ihre Sitzung läuft bald ab",
    body: "Ihre GITacademy-Sitzung endet wegen Inaktivität in {time}. Nicht gespeicherte Eingaben können verloren gehen.",
    extend: "Sitzung verlängern", logout: "Abmelden", loading: "Wird verlängert …",
    error: "Verlängerung fehlgeschlagen. Bitte erneut versuchen.",
  },
  en: {
    title: "Your session is about to expire",
    body: "Your GITacademy session will end due to inactivity in {time}. Unsaved input may be lost.",
    extend: "Extend session", logout: "Log out", loading: "Extending …",
    error: "Could not extend the session. Please try again.",
  },
};

function lang(): "de" | "en" {
  return (navigator.language ?? "en").toLowerCase().startsWith("de") ? "de" : "en";
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function api(path: string, method: "GET" | "POST"): Promise<Response> {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("__Host-ga_csrf="))?.split("=")[1] ?? "";
  return fetch(`${SESSION_BASE}/${path}`, {
    method,
    credentials: "include",
    headers: method === "POST" ? { "X-CSRF-Token": csrf } : {},
  });
}

export function SessionTimeout() {
  const [warnUntil, setWarnUntil] = useState<number | null>(null); // idleExpiresAt in ms, wenn in Warnphase
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keycloakLastActivity = useRef(Date.now());
  const t = T[lang()];

  const poll = useCallback(async () => {
    if (!SESSION_BASE) return;
    try {
      const res = await api("status", "GET");
      if (res.status === 401) { window.location.assign("/sso/expired"); return; }
      const s: Status = await res.json();
      if (!s.authenticated || !s.idleExpiresAt || !s.warningAt) { setWarnUntil(null); return; }
      const now = Date.now();
      const warnAt = new Date(s.warningAt).getTime();
      const idleAt = new Date(s.idleExpiresAt).getTime();
      if (now >= idleAt) { window.location.assign("/sso/expired"); return; }
      setWarnUntil(now >= warnAt ? idleAt : null);
    } catch { /* Netzwerkfehler ignorieren, nächster Poll versucht erneut */ }
  }, []);

  // Statuspolling
  useEffect(() => {
    if (!SESSION_BASE) return;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // Keycloak erneuert Tokens automatisch. Ohne einen separaten
  // Inaktivitätswächter könnte dieser technische Refresh die Realm-Sitzung
  // unbegrenzt am Leben halten, obwohl der Benutzer den Tab nicht verwendet.
  useEffect(() => {
    if (SESSION_BASE || !KEYCLOAK_MODE) return;
    let lastRecorded = 0;
    const activity = () => {
      const now = Date.now();
      if (now - lastRecorded < 1000) return;
      lastRecorded = now;
      keycloakLastActivity.current = now;
      setWarnUntil(null);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    const timer = window.setInterval(() => {
      const expiresAt = keycloakLastActivity.current + KEYCLOAK_IDLE_MS;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        void keycloakLogout();
      } else if (remainingMs <= KEYCLOAK_WARNING_MS) {
        setWarnUntil(expiresAt);
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, activity));
    };
  }, []);

  // Sekunden-Countdown während der Warnphase
  useEffect(() => {
    if (warnUntil == null) return;
    const tick = () => {
      const rem = warnUntil - Date.now();
      setRemaining(rem);
      if (rem <= 0) window.location.assign("/sso/expired");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [warnUntil]);

  // Fokus ins Modal (a11y §16)
  useEffect(() => { if (warnUntil != null) dialogRef.current?.focus(); }, [warnUntil]);

  const extend = async () => {
    if (!SESSION_BASE && KEYCLOAK_MODE) {
      keycloakLastActivity.current = Date.now();
      setWarnUntil(null);
      return;
    }
    setBusy(true); setError(false);
    try {
      const res = await api("extend", "POST");
      if (res.status === 401) { window.location.assign("/sso/expired"); return; }
      if (!res.ok) { setError(true); return; }
      setWarnUntil(null);
      await poll();
    } catch { setError(true); } finally { setBusy(false); }
  };

  const logout = async () => {
    if (!SESSION_BASE && KEYCLOAK_MODE) {
      await keycloakLogout();
      return;
    }
    try { await api("logout", "POST"); } finally { window.location.assign("/sso/expired"); }
  };

  if ((!SESSION_BASE && !KEYCLOAK_MODE) || warnUntil == null) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sto-title"
        aria-describedby="sto-body"
        tabIndex={-1}
        className="max-w-[420px] w-full bg-white rounded-xl border border-[#C3C9D1] p-6 shadow-2xl outline-none"
      >
        <h2 id="sto-title" className="text-[18px] font-semibold text-[#232830] mb-2">{t.title}</h2>
        <p id="sto-body" className="text-[14px] text-[#5A6472] mb-1 leading-relaxed">
          {t.body.replace("{time}", fmt(remaining))}
        </p>
        {/* Countdown für Screenreader dezent (nicht jede Sekunde vorlesen) */}
        <p className="text-[28px] font-bold text-[#232830] tabular-nums my-3" aria-live="off">{fmt(remaining)}</p>
        <span className="sr-only" aria-live="polite">{Math.ceil(remaining / 60000)} Minuten verbleibend</span>
        {error && <p className="text-[13px] text-[#B42318] mb-3">{t.error}</p>}
        <div className="flex gap-2 mt-2">
          <button
            onClick={extend}
            disabled={busy}
            className="flex-1 h-11 rounded-lg font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-70"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}
          >
            {busy ? <><span className="w-4 h-4 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" /> {t.loading}</> : t.extend}
          </button>
          <button
            onClick={logout}
            className="px-5 h-11 rounded-lg border border-[#C3C9D1] text-[14px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors"
          >
            {t.logout}
          </button>
        </div>
      </div>
    </div>
  );
}
