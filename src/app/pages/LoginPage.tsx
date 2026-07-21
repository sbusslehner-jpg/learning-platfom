import { useState, useRef } from "react";
import { AlertCircle, Eye } from "lucide-react";
import logo from "../../imports/GroupIT_Logo.png";

// ─── Login Screen ─────────────────────────────────────────────────────────────

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Bitte E-Mail und Passwort eingeben."); emailRef.current?.focus(); return; }
    setLoading(true); setError("");
    await new Promise(r => setTimeout(r, 800));
    if (email === "wrong@example.com") {
      setError("E-Mail oder Passwort ist nicht korrekt."); setLoading(false); emailRef.current?.focus(); return;
    }
    onLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #232830 0%, #2E3540 50%, #3A424E 100%)" }}>
      <div className="w-full max-w-[400px]">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Logo strip */}
          <div className="px-8 pt-8 pb-6 border-b border-[#EEF1F4] flex justify-center">
            <img src={logo} alt="GroupIT – After Sales IT" className="h-10 object-contain" />
          </div>
          {/* Form */}
          <div className="px-8 py-8">
            <h1 className="text-[22px] font-semibold text-[#232830] mb-1">Anmelden</h1>
            <p className="text-[14px] text-[#5A6472] mb-6">ServiceQ Lernplattform</p>

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
          </div>
        </div>
        <p className="text-center text-[12px] text-white/40 mt-6">© 2026 GroupIT – After Sales IT · Porsche Konstruktionen GmbH &amp; Co KG</p>
      </div>
    </div>
  );
}
