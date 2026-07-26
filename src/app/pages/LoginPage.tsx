import { useState, useRef } from "react";
import { Link } from "react-router";
import { AlertCircle, Eye, LogIn, ShieldAlert } from "lucide-react";
import logo from "../../imports/GroupIT_Logo.png";
import { KEYCLOAK_MODE, login as keycloakLogin } from "../data/keycloakAuth";

// ─── Rahmen (gleiches Layout für Keycloak- und Demo-Anmeldung) ────────────────

function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #232830 0%, #2E3540 50%, #3A424E 100%)" }}>
      <div className="w-full max-w-[400px]">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Logo strip */}
          <div className="px-8 pt-8 pb-6 border-b border-[#EEF1F4] flex justify-center">
            <img src={logo} alt="GroupIT – After Sales IT" className="h-10 object-contain" />
          </div>
          {/* Inhalt */}
          <div className="px-8 py-8">{children}</div>
        </div>
        <p className="text-center text-[12px] text-white/40 mt-6">© 2026 GroupIT – After Sales IT · Porsche Konstruktionen GmbH &amp; Co KG</p>
        <p className="text-center text-[12px] mt-2">
          <Link to="/impressum" className="text-white/50 hover:text-white/80 hover:underline transition-colors">Impressum</Link>
          <span className="text-white/30 mx-2">·</span>
          <Link to="/datenschutz" className="text-white/50 hover:text-white/80 hover:underline transition-colors">Datenschutz</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Keycloak-Anmeldung ───────────────────────────────────────────────────────
// Echte Anmeldung: kein Formular in der Plattform. Zugangsdaten werden
// ausschließlich auf der Keycloak-Anmeldeseite (Theme `groupit`) eingegeben –
// die SPA sieht sie nie.

function KeycloakSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = () => {
    setBusy(true); setError("");
    keycloakLogin().catch(() => {
      setBusy(false);
      setError("Die Anmeldung ist derzeit nicht erreichbar. Bitte versuchen Sie es erneut.");
    });
  };

  return (
    <LoginFrame>
      <h1 className="text-[22px] font-semibold text-[#232830] mb-1">Anmelden</h1>
      <p className="text-[14px] text-[#5A6472] mb-6">ServiceQ Lernplattform</p>

      {error && (
        <div className="flex items-start gap-2 bg-[#FDEEEC] text-[#B42318] border border-[#B42318]/20 rounded-lg px-4 py-3 text-[14px] mb-5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={start}
        disabled={busy}
        aria-label="Mit GroupIT-Konto anmelden"
        className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009D97]"
        style={{ backgroundColor: busy ? "#00B3AC" : "#00C8C1", color: "#232830" }}
        onMouseEnter={e => { if (!busy) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#00B3AC"; }}
        onMouseLeave={e => { if (!busy) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#00C8C1"; }}
      >
        {busy ? (
          <span className="inline-block w-5 h-5 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" role="status" aria-label="Weiterleitung zur Anmeldung" />
        ) : (
          <><LogIn size={16} aria-hidden /> Mit GroupIT-Konto anmelden</>
        )}
      </button>

      <p className="mt-4 text-[12px] text-[#5A6472] leading-snug text-center">
        Die Anmeldung erfolgt über das zentrale GroupIT-Konto. Passwort vergessen?
        Das lässt sich direkt auf der Anmeldeseite zurücksetzen.
      </p>
    </LoginFrame>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  // Im Keycloak-Modus ersetzt der Absprung die Demo-Anmeldung vollständig.
  if (KEYCLOAK_MODE) return <KeycloakSignIn />;
  return <DemoLogin onLogin={onLogin} />;
}

// ─── Demo-Anmeldung (unverändert) ─────────────────────────────────────────────

function DemoLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // ⚠️  Demo-Anmeldung: Es findet KEINE Prüfung von Zugangsdaten statt.
  //     Im Produktivbetrieb entfällt diese Seite vollständig – der Zugang
  //     erfolgt ausschließlich über den ServiceQ-Absprung (SSO-Handshake,
  //     siehe docs/serviceq-academy/). Die Rollenauswahl nach dem Einstieg
  //     dient nur der Vorführung der Berechtigungslogik.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Bitte E-Mail und Passwort eingeben."); emailRef.current?.focus(); return; }
    setLoading(true); setError("");
    await new Promise(r => setTimeout(r, 400));
    onLogin();
  };

  return (
    <LoginFrame>
      <>
            <h1 className="text-[22px] font-semibold text-[#232830] mb-1">Anmelden</h1>
            <p className="text-[14px] text-[#5A6472] mb-4">ServiceQ Lernplattform</p>

            {/* Ehrlicher Hinweis: keine echte Authentifizierung in dieser Demo */}
            <div className="flex items-start gap-2 bg-[#FDF3E4] text-[#B45309] rounded-lg px-3 py-2.5 text-[12px] mb-5 leading-snug">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <strong>Demo-Zugang.</strong> Zugangsdaten werden nicht geprüft. Im Produktivbetrieb
                erfolgt der Einstieg ausschließlich über ServiceQ.
              </span>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-[#FDEEEC] text-[#B42318] border border-[#B42318]/20 rounded-lg px-4 py-3 text-[14px] mb-5">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} noValidate className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">E-Mail-Adresse</label>
                <input
                  ref={emailRef} id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@haendler.de"
                  className="w-full h-11 px-3 rounded-lg border text-[15px] text-[#232830] placeholder:text-[#8A93A0] bg-white outline-none transition-all"
                  style={{ borderColor: error ? "#B42318" : "#8A93A0" }}
                  onFocus={e => { if (!error) e.target.style.borderColor = "#009D97"; e.target.style.boxShadow = "0 0 0 2px #009D9740"; }}
                  onBlur={e => { e.target.style.borderColor = error ? "#B42318" : "#8A93A0"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <div>
                <label htmlFor="pw" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">Passwort</label>
                <div className="relative">
                  <input
                    id="pw" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 px-3 pr-11 rounded-lg border text-[15px] text-[#232830] placeholder:text-[#8A93A0] bg-white outline-none transition-all"
                    style={{ borderColor: error ? "#B42318" : "#8A93A0" }}
                    onFocus={e => { if (!error) e.target.style.borderColor = "#009D97"; e.target.style.boxShadow = "0 0 0 2px #009D9740"; }}
                    onBlur={e => { e.target.style.borderColor = error ? "#B42318" : "#8A93A0"; e.target.style.boxShadow = "none"; }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A93A0] hover:text-[#5A6472] transition-colors p-1 rounded"
                    aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"}>
                    <Eye size={16} />
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: loading ? "#00B3AC" : "#00C8C1", color: "#232830" }}
                onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = "#00B3AC"; }}
                onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = "#00C8C1"; }}
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" />
                ) : "Anmelden"}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button className="text-[13px] text-[#007D78] hover:text-[#00504C] hover:underline transition-colors">
                Passwort vergessen?
              </button>
            </div>
      </>
    </LoginFrame>
  );
}
