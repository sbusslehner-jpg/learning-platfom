import { useState, useRef } from "react";
import {
  Home, BookOpen, FileText, Languages, Users, Globe, Settings,
  Search, HelpCircle, User, ChevronRight, Play, Check, CheckCircle2,
  PencilLine, AlertCircle, History, Sparkles, Lock, CircleDashed,
  Plus, MoreVertical, GripVertical, Trash2, ChevronLeft, X,
  RefreshCw, ArrowRight, Clock, Menu, LogOut, Filter,
  Unlock, BookMarked, Map, Eye, ChevronDown, Send,
  Bell, AlertTriangle,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import logo from "../imports/GroupIT_Logo.png";

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | "login" | "dashboard" | "catalog" | "training-overview"
  | "learning" | "editor-tree" | "editor-content"
  | "translations-overview" | "translations-review"
  | "admin-users" | "admin-markets" | "admin-settings";

type Status = "draft" | "published" | "outdated" | "missing" | "auto" | "corrected" | "error";

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS: Record<Status, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
  draft:     { label: "Entwurf",       icon: <PencilLine  size={12} />, bg: "#EEF1F4", color: "#5A6472" },
  published: { label: "Veröffentlicht",icon: <CheckCircle2 size={12} />, bg: "#EAF8F0", color: "#15803D" },
  outdated:  { label: "Veraltet",      icon: <History      size={12} />, bg: "#FDF3E4", color: "#B45309" },
  missing:   { label: "Fehlend",       icon: <CircleDashed size={12} />, bg: "#EEF1F4", color: "#5A6472" },
  auto:      { label: "Automatisch",   icon: <Sparkles     size={12} />, bg: "#EBF1FE", color: "#1D5BD6" },
  corrected: { label: "Gesperrt",      icon: <Lock         size={12} />, bg: "#EAF8F0", color: "#15803D" },
  error:     { label: "Fehler",        icon: <AlertCircle  size={12} />, bg: "#FDEEEC", color: "#B42318" },
};

// ─── Reusable components ───────────────────────────────────────────────────────

function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[12px]"}`}
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span style={{ color: s.color, display: "flex" }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

function ProgressRing({ percent, size = 36, stroke = 3 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#C3C9D1" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#00C8C1" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-1.5 bg-[#C3C9D1] rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-[#00C8C1] rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav className="flex items-center gap-1 text-[13px] text-[#5A6472] mb-6 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i < items.length - 1 ? (
            <><span className="hover:text-[#007D78] cursor-pointer transition-colors">{item}</span><ChevronRight size={13} className="text-[#8A93A0]" /></>
          ) : (
            <span className="text-[#3A424E] font-medium">{item}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
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

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({ onMenuToggle, collapsed }: { onMenuToggle: () => void; collapsed: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <header className="h-16 bg-white border-b border-[#E1E5EA] flex items-center px-4 gap-4 z-20 shrink-0">
      <button onClick={onMenuToggle}
        className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors lg:hidden"
        aria-label="Menü umschalten">
        <Menu size={20} />
      </button>
      <div className="hidden lg:block">
        <img src={logo} alt="GroupIT" className="h-8 object-contain" />
      </div>

      {/* Search */}
      <div className="flex-1 max-w-md mx-auto lg:mx-0 lg:ml-8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A0]" />
          <input
            type="search" placeholder="Trainings, Module, Kapitel suchen …" value={query}
            onChange={e => setQuery(e.target.value)} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            className="w-full h-9 pl-9 pr-4 bg-[#F6F8FA] border border-[#C3C9D1] rounded-lg text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all"
          />
          {searchOpen && query.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#C3C9D1] rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-[#8A93A0] tracking-wider uppercase">Trainings</div>
              {["DSR – Konfiguration Einzelhandel", "DSR – Rollenzuweisung", "CCD – Grundkonfiguration"].filter(t => t.toLowerCase().includes(query.toLowerCase())).map(t => (
                <button key={t} className="w-full text-left px-4 py-2.5 text-[14px] text-[#232830] hover:bg-[#E6FAF9] flex items-center gap-2 transition-colors">
                  <BookOpen size={14} className="text-[#00C8C1]" />{t}
                </button>
              ))}
              {query.length >= 2 && <div className="px-4 py-2 text-[12px] text-[#007D78] border-t border-[#EEF1F4] hover:bg-[#E6FAF9] cursor-pointer">Alle Ergebnisse für „{query}" anzeigen →</div>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <button className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors" aria-label="Hilfe"><HelpCircle size={20} /></button>
        <button className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors relative" aria-label="Benachrichtigungen">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#00C8C1] rounded-full" />
        </button>
        <button className="ml-1 flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#EEF1F4] transition-colors">
          <div className="w-7 h-7 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[11px] font-bold">MK</div>
          <span className="hidden lg:block text-[14px] font-medium text-[#3A424E]">Max Keller</span>
        </button>
      </div>
    </header>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { section: "Lernen",      items: [{ id: "dashboard",    label: "Start",              icon: Home },
                                     { id: "catalog",      label: "Katalog",            icon: BookOpen }] },
  { section: "Redaktion",   items: [{ id: "editor-tree",  label: "Inhalte",            icon: FileText },
                                     { id: "translations-overview", label: "Übersetzungen", icon: Languages }] },
  { section: "Verwaltung",  items: [{ id: "admin-users",  label: "Benutzer",           icon: Users },
                                     { id: "admin-markets",label: "Märkte & Sprachen",  icon: Map },
                                     { id: "admin-settings",label: "Einstellungen",     icon: Settings }] },
];

function Sidebar({ current, onNavigate, collapsed, mobile, onClose }: {
  current: Screen; onNavigate: (s: Screen) => void; collapsed: boolean; mobile?: boolean; onClose?: () => void;
}) {
  const isActive = (id: string) => current === id || (id === "editor-tree" && current === "editor-content");
  return (
    <aside
      className={`flex flex-col bg-[#2E3540] transition-all duration-200 shrink-0 ${mobile ? "fixed inset-y-0 left-0 z-40 w-72 shadow-2xl" : collapsed ? "w-[72px]" : "w-64"}`}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Mobile logo */}
      {mobile && (
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#3A424E]">
          <img src={logo} alt="GroupIT" className="h-7 object-contain brightness-0 invert" />
          <button onClick={onClose} className="p-2 text-white/60 hover:text-white transition-colors"><X size={18} /></button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV_ITEMS.map(({ section, items }) => (
          <div key={section} className="mb-6">
            {!collapsed && (
              <div className="px-4 mb-1 text-[10px] font-semibold tracking-widest text-white/30 uppercase">{section}</div>
            )}
            {items.map(({ id, label, icon: Icon }) => {
              const active = isActive(id);
              return (
                <button
                  key={id}
                  onClick={() => { onNavigate(id as Screen); onClose?.(); }}
                  title={collapsed ? label : undefined}
                  className={`w-full flex items-center transition-all duration-100 relative
                    ${collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-2.5"}
                    ${active ? "bg-[#232830]" : "hover:bg-[#3A424E]"}`}
                >
                  {active && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                  <Icon size={20} style={{ color: active ? "#00C8C1" : "rgba(255,255,255,0.6)" }} className="shrink-0" />
                  {!collapsed && <span className={`text-[14px] font-medium ${active ? "text-[#00C8C1]" : "text-white/70"}`}>{label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-[#3A424E]">
          <button className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors w-full">
            <LogOut size={15} /><span>Abmelden</span>
          </button>
        </div>
      )}
    </aside>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <h1 className="text-[28px] font-semibold text-[#232830] mb-1">Guten Morgen, Max!</h1>
      <p className="text-[15px] text-[#5A6472] mb-8">Montag, 21. Juli 2026</p>

      {/* Weiterlernen hero */}
      <div className="bg-white rounded-xl border border-[#C3C9D1] p-6 mb-8 flex items-center gap-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="relative shrink-0">
          <ProgressRing percent={62} size={80} stroke={5} />
          <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-[#232830]">62%</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-[#5A6472] uppercase tracking-wider mb-1">Zuletzt geöffnet · ServiceQ</div>
          <h2 className="text-[20px] font-semibold text-[#232830] leading-tight mb-1">DSR – Konfiguration im Einzelhandel</h2>
          <p className="text-[14px] text-[#5A6472]">Kapitel 3: DealerData-Synchronisation · ca. 12 Min.</p>
        </div>
        <button
          onClick={() => onNavigate("learning")}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
        >
          Weiterlernen <ArrowRight size={16} />
        </button>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Neu für dich */}
        <div className="xl:col-span-1">
          <h2 className="text-[17px] font-semibold text-[#232830] mb-4">Neu für dich</h2>
          <div className="space-y-3">
            {[
              { title: "CCD – Grundkonfiguration", module: "CCD", duration: "18 Min.", isNew: true },
              { title: "RPD – Remote Service Setup", module: "RPD", duration: "11 Min.", isNew: true },
            ].map(t => (
              <button key={t.title} onClick={() => onNavigate("learning")}
                className="w-full text-left bg-white rounded-lg border border-[#C3C9D1] p-4 hover:border-[#00C8C1] hover:shadow-sm transition-all group">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-[#5A6472] uppercase tracking-wide">ServiceQ · {t.module}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EBF1FE] text-[#1D5BD6]">Neu</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors leading-snug">{t.title}</p>
                    <div className="flex items-center gap-1 mt-1.5 text-[12px] text-[#5A6472]"><Clock size={11} />{t.duration}</div>
                  </div>
                  <ArrowRight size={16} className="text-[#C3C9D1] group-hover:text-[#00C8C1] transition-colors mt-1 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Meine Trainings */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-semibold text-[#232830]">Meine Trainings</h2>
            <button onClick={() => onNavigate("catalog")} className="text-[13px] text-[#007D78] hover:underline">Alle anzeigen</button>
          </div>
          <div className="space-y-3">
            {[
              { title: "DSR – Konfiguration im Einzelhandel", module: "DSR", progress: 62, status: "begonnen" },
              { title: "DSR – Rollenzuweisung und Berechtigungen", module: "DSR", progress: 100, status: "abgeschlossen" },
              { title: "ServiceQ – Systemüberblick", module: "Onboarding", progress: 100, status: "abgeschlossen" },
              { title: "DSR – Fehlerbehandlung & Logs", module: "DSR", progress: 0, status: "offen" },
            ].map(t => (
              <button key={t.title} onClick={() => onNavigate("learning")}
                className="w-full text-left bg-white rounded-lg border border-[#C3C9D1] px-4 py-3 hover:border-[#00C8C1] hover:shadow-sm transition-all group flex items-center gap-4">
                <div className="relative shrink-0">
                  <ProgressRing percent={t.progress} size={40} stroke={3} />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#3A424E]">{t.progress}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors truncate">{t.title}</p>
                  <p className="text-[12px] text-[#5A6472] mt-0.5">ServiceQ · {t.module}</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${t.status === "abgeschlossen" ? "bg-[#EAF8F0] text-[#15803D]" : t.status === "begonnen" ? "bg-[#EBF1FE] text-[#1D5BD6]" : "bg-[#EEF1F4] text-[#5A6472]"}`}>
                  {t.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

function Catalog({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const modules = [
    { name: "Digital Service Reception", code: "DSR", count: 6, done: 3 },
    { name: "Remote Prognose & Diagnose", code: "RPD", count: 4, done: 0 },
    { name: "Connected Car Diagnostics", code: "CCD", count: 5, done: 0 },
    { name: "Onboarding & Systemüberblick", code: "OB", count: 3, done: 3 },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["ServiceQ", "Katalog"]} />
      <h1 className="text-[28px] font-semibold text-[#232830] mb-2">Trainings-Katalog</h1>
      <p className="text-[15px] text-[#5A6472] mb-8">Alle verfügbaren Trainings für ServiceQ in Ihrem Markt</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map(m => (
          <button key={m.code} onClick={() => onNavigate("training-overview")}
            className="text-left bg-white rounded-xl border border-[#C3C9D1] p-6 hover:border-[#00C8C1] hover:shadow-md transition-all group">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-[11px] font-bold text-[#5A6472] tracking-widest uppercase mb-1">{m.code}</div>
                <h2 className="text-[18px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors leading-tight">{m.name}</h2>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#E6FAF9] flex items-center justify-center shrink-0">
                <BookMarked size={22} style={{ color: "#00C8C1" }} />
              </div>
            </div>
            <div className="flex items-center justify-between text-[13px] text-[#5A6472] mb-3">
              <span>{m.count} Trainings</span>
              <span>{m.done}/{m.count} abgeschlossen</span>
            </div>
            <ProgressBar percent={Math.round((m.done / m.count) * 100)} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Training Overview ────────────────────────────────────────────────────────

function TrainingOverview({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const trainings = [
    { title: "DSR – Konfiguration im Einzelhandel", duration: "51 Min.", progress: 62, isNew: false },
    { title: "DSR – Rollenzuweisung und Berechtigungen", duration: "32 Min.", progress: 100, isNew: false },
    { title: "DSR – DealerData-Synchronisation", duration: "28 Min.", progress: 0, isNew: true },
    { title: "DSR – Fehlerbehandlung & Logs", duration: "24 Min.", progress: 0, isNew: false },
    { title: "DSR – Mobilgeräteverwaltung", duration: "19 Min.", progress: 0, isNew: true },
    { title: "DSR – API-Integration & Webhooks", duration: "38 Min.", progress: 0, isNew: false },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["ServiceQ", "Katalog", "Digital Service Reception"]} />
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold text-[#5A6472] tracking-widest uppercase mb-1">DSR</div>
          <h1 className="text-[26px] font-semibold text-[#232830]">Digital Service Reception</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["Alle", "Begonnen", "Neu"].map(f => (
            <button key={f} className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${f === "Alle" ? "bg-[#E6FAF9] border-[#00C8C1] text-[#007D78]" : "bg-white border-[#C3C9D1] text-[#5A6472] hover:border-[#8A93A0]"}`}>{f}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {trainings.map(t => (
          <button key={t.title} onClick={() => onNavigate("learning")}
            className="text-left bg-white rounded-lg border border-[#C3C9D1] p-4 hover:border-[#00C8C1] hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  {t.isNew && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EBF1FE] text-[#1D5BD6]">Neu</span>}
                  {t.progress === 100 && <StatusBadge status="published" compact />}
                </div>
                <p className="text-[14px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors leading-snug line-clamp-2">{t.title}</p>
                <div className="flex items-center gap-1 mt-2 text-[12px] text-[#5A6472]"><Clock size={11} />{t.duration}</div>
              </div>
              <div className="relative shrink-0">
                <ProgressRing percent={t.progress} size={40} stroke={3} />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#3A424E]">{t.progress}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-3 border-t border-[#EEF1F4]">
              <span className="text-[12px] text-[#007D78] font-medium group-hover:underline">
                {t.progress > 0 && t.progress < 100 ? "Weiterlernen" : t.progress === 100 ? "Wiederholen" : "Starten"} →
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Learning View ────────────────────────────────────────────────────────────

const CHAPTERS = [
  { id: 1, title: "Überblick & Konfigurationsebenen", done: true, active: false },
  { id: 2, title: "Rollenzuweisung im System", done: true, active: false },
  { id: 3, title: "DealerData-Synchronisation", done: false, active: true },
  { id: 4, title: "Konfiguration Serviceannahme", done: false, active: false },
  { id: 5, title: "Fehlerbehandlung & Logs", done: false, active: false },
];

// ─── Completion Screen ────────────────────────────────────────────────────────

function CompletionScreen({ title, onBack, onNext }: { title: string; onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[#F6F8FA]">
      <div className="max-w-[520px] w-full text-center">
        {/* Ring */}
        <div className="relative inline-flex mb-8">
          <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={70} cy={70} r={58} fill="none" stroke="#E6FAF9" strokeWidth={8} />
            <circle cx={70} cy={70} r={58} fill="none" stroke="#00C8C1" strokeWidth={8}
              strokeDasharray={364.4} strokeDashoffset={0} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <CheckCircle2 size={36} style={{ color: "#00C8C1" }} strokeWidth={1.5} />
            <span className="text-[13px] font-bold text-[#232830] mt-1">100%</span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF8F0] text-[#15803D] text-[12px] font-semibold mb-4">
          <CheckCircle2 size={13} /> Abgeschlossen
        </div>

        <h1 className="text-[26px] font-semibold text-[#232830] leading-tight mb-2">Training abgeschlossen</h1>
        <p className="text-[16px] text-[#5A6472] mb-2">{title}</p>
        <p className="text-[14px] text-[#8A93A0] mb-10">Alle 5 Kapitel wurden erfolgreich durchgearbeitet.</p>

        <div className="bg-white rounded-xl border border-[#C3C9D1] p-5 mb-8 text-left grid grid-cols-3 gap-4 shadow-sm">
          {[
            { label: "Kapitel", value: "5/5" },
            { label: "Elemente", value: "18" },
            { label: "Dauer", value: "51 Min." },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[22px] font-bold text-[#232830] tabular-nums">{s.value}</div>
              <div className="text-[12px] text-[#5A6472] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={onBack}
            className="px-6 py-2.5 rounded-lg border border-[#C3C9D1] text-[14px] font-semibold text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
            Zur Modulubersicht
          </button>
          <button onClick={onNext}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
          >
            Nachstes Training <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function LearningView({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [activeChapter, setActiveChapter] = useState(3);
  const [chapterListOpen, setChapterListOpen] = useState(true);
  const [chapterDone, setChapterDone] = useState<Set<number>>(new Set([1, 2]));
  const [showCompletion, setShowCompletion] = useState(false);

  const chapter = CHAPTERS.find(c => c.id === activeChapter)!;
  const allDone = chapterDone.size === CHAPTERS.length;

  const finishChapter = () => {
    const next = CHAPTERS.find(c => c.id > activeChapter && !chapterDone.has(c.id));
    const updated = new Set(chapterDone).add(activeChapter);
    setChapterDone(updated);
    if (next) {
      setActiveChapter(next.id);
      toast.success(`Kapitel ${activeChapter} abgeschlossen`);
    } else {
      setShowCompletion(true);
    }
  };

  const progress = Math.round((chapterDone.size / CHAPTERS.length) * 100);

  if (showCompletion) {
    return (
      <CompletionScreen
        title="DSR – Konfiguration im Einzelhandel"
        onBack={() => onNavigate("training-overview")}
        onNext={() => { setShowCompletion(false); setChapterDone(new Set([1, 2])); setActiveChapter(3); onNavigate("training-overview"); }}
      />
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Chapter sidebar */}
      <div className={`bg-white border-r border-[#E1E5EA] flex-col transition-all duration-200 hidden lg:flex ${chapterListOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        <div className="p-4 border-b border-[#EEF1F4]">
          <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider mb-1">Kapitel</div>
          <ProgressBar percent={progress} className="mt-2" />
          <div className="text-[12px] text-[#5A6472] mt-1">{chapterDone.size}/{CHAPTERS.length} abgeschlossen</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {CHAPTERS.map(ch => (
            <button key={ch.id} onClick={() => setActiveChapter(ch.id)}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors relative ${activeChapter === ch.id ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
              {activeChapter === ch.id && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${chapterDone.has(ch.id) ? "bg-[#00C8C1]" : activeChapter === ch.id ? "border-2 border-[#00C8C1]" : "border-2 border-[#C3C9D1]"}`}>
                {chapterDone.has(ch.id) && <Check size={11} strokeWidth={2.5} color="#232830" />}
              </div>
              <span className={`text-[13px] leading-snug ${activeChapter === ch.id ? "text-[#007D78] font-semibold" : chapterDone.has(ch.id) ? "text-[#5A6472]" : "text-[#3A424E]"}`}>
                {ch.title}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 z-10">
          <button onClick={() => onNavigate("training-overview")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[#5A6472]">DSR – Konfiguration im Einzelhandel</p>
            <p className="text-[14px] font-semibold text-[#232830] truncate">Kapitel {activeChapter}: {chapter.title}</p>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-8 h-8">
              <ProgressRing percent={progress} size={32} stroke={3} />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-[#232830]">{progress}%</span>
            </div>
          </div>
          <button onClick={() => setChapterListOpen(!chapterListOpen)}
            className="hidden lg:flex items-center gap-1 text-[13px] text-[#5A6472] hover:text-[#3A424E] px-2 py-1.5 rounded-lg hover:bg-[#EEF1F4] transition-colors">
            <BookOpen size={15} /> Kapitel
          </button>
        </div>

        {/* Content */}
        <div className="max-w-[720px] mx-auto px-6 lg:px-8 py-8">
          <h1 className="text-[24px] font-semibold text-[#232830] mb-6 leading-tight">
            Kapitel {activeChapter}: {chapter.title}
          </h1>

          {activeChapter === 3 && (
            <>
              {/* Video element */}
              <div className="bg-[#2E3540] rounded-lg overflow-hidden mb-6 aspect-video flex items-center justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[#232830] to-[#3A424E]" />
                <div className="relative flex flex-col items-center gap-3">
                  <button className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105"
                    style={{ backgroundColor: "#00C8C1" }}>
                    <Play size={24} fill="#232830" color="#232830" className="ml-1" />
                  </button>
                  <span className="text-white/80 text-[14px]">DealerData-Synchronisation – Einführung (6:42)</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-6 bg-gradient-to-t from-black/60">
                  <div className="h-1 bg-white/20 rounded-full"><div className="h-full w-1/3 bg-[#00C8C1] rounded-full" /></div>
                  <div className="flex justify-between text-white/60 text-[11px] mt-1"><span>2:14</span><span>6:42</span></div>
                </div>
              </div>

              {/* Text content */}
              <p className="text-[17px] text-[#3A424E] leading-[1.75] mb-5">
                Die DealerData-Synchronisation stellt sicher, dass alle Fahrzeug- und Kundendaten zwischen dem DSR-System und dem Händler-DMS synchron gehalten werden. Dieser Prozess läuft automatisch im Hintergrund – jedoch müssen die korrekten Verbindungsparameter einmalig konfiguriert werden.
              </p>
              <p className="text-[17px] text-[#3A424E] leading-[1.75] mb-8">
                Bevor Sie beginnen, stellen Sie sicher, dass die DealerData-API-Zugangsdaten vorliegen. Diese erhalten Sie vom IT-Verantwortlichen Ihres Hauses oder direkt aus dem GroupIT-Partnerportal.
              </p>

              {/* Step instruction */}
              <div className="bg-[#F6F8FA] rounded-lg border border-[#E1E5EA] p-5 mb-6">
                <h3 className="text-[15px] font-semibold text-[#232830] mb-4 flex items-center gap-2">
                  <span className="w-5 h-5 bg-[#2E3540] rounded-full text-white text-[10px] flex items-center justify-center font-bold">★</span>
                  Grundkonfiguration durchführen
                </h3>
                <ol className="space-y-4">
                  {[
                    "Öffnen Sie das DSR-Verwaltungsmenü und navigieren Sie zu Einstellungen > Datensynchronisation.",
                    "Geben Sie die API-URL und den API-Key ein. Achten Sie auf das korrekte Format (https://api.example.com).",
                    "Klicken Sie auf Verbindung testen. Eine grüne Bestätigung erscheint bei Erfolg.",
                    "Legen Sie das Synchronisationsintervall fest (empfohlen: 5 Minuten) und speichern Sie.",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-[#2E3540] text-white text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-[15px] text-[#3A424E] leading-snug pt-0.5">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Image element */}
              <div className="mb-8">
                <div className="rounded-lg border border-[#C3C9D1] overflow-hidden bg-[#EEF1F4] aspect-[16/7] flex items-center justify-center">
                  <div className="text-center text-[#8A93A0]">
                    <div className="w-12 h-12 bg-[#C3C9D1] rounded-lg mx-auto mb-2 flex items-center justify-center"><Eye size={20} /></div>
                    <p className="text-[13px]">Screenshot: DSR Datensynchronisation</p>
                  </div>
                </div>
                <p className="text-[13px] text-[#5A6472] mt-2 text-center italic">DSR – Einstellungsmenü Datensynchronisation mit API-Konfiguration</p>
              </div>
            </>
          )}

          {activeChapter !== 3 && (
            <p className="text-[17px] text-[#3A424E] leading-[1.75]">
              Inhalt für Kapitel {activeChapter}: {chapter.title}. In einer vollständigen Implementierung stehen hier Texte, Videos, Schritt-Anleitungen und Screenshots aus der ServiceQ-Dokumentation.
            </p>
          )}

          {/* CTA */}
          <div className="mt-10 pt-6 border-t border-[#E1E5EA] flex items-center justify-between">
            {activeChapter > 1 && (
              <button onClick={() => setActiveChapter(activeChapter - 1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#C3C9D1] text-[14px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
                <ChevronLeft size={16} /> Vorheriges Kapitel
              </button>
            )}
            <div className="ml-auto">
              <button onClick={finishChapter}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
                style={{ backgroundColor: "#00C8C1", color: "#232830" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
              >
                {chapterDone.has(activeChapter) ? "Nächstes Kapitel" : "Kapitel abschliessen & weiter"} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Editor: Content Tree ─────────────────────────────────────────────────────

const CONTENT_TREE = [
  {
    product: "ServiceQ", modules: [
      { name: "Digital Service Reception (DSR)", trainings: [
        { title: "Konfiguration im Einzelhandel", status: "published" as Status, chapters: 5 },
        { title: "Rollenzuweisung und Berechtigungen", status: "published" as Status, chapters: 4 },
        { title: "DealerData-Synchronisation", status: "draft" as Status, chapters: 3 },
        { title: "Fehlerbehandlung & Logs", status: "draft" as Status, chapters: 4 },
      ]},
      { name: "Remote Prognose & Diagnose (RPD)", trainings: [
        { title: "RPD – Systemüberblick", status: "published" as Status, chapters: 3 },
        { title: "RPD – Grundkonfiguration", status: "draft" as Status, chapters: 5 },
      ]},
    ]
  }
];

function EditorTree({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [openModules, setOpenModules] = useState<Set<string>>(new Set(["Digital Service Reception (DSR)"]));
  const toggle = (name: string) => setOpenModules(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Tree panel */}
      <div className="w-80 bg-white border-r border-[#E1E5EA] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#EEF1F4] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#232830]">Inhaltsstruktur</h2>
          <button onClick={() => onNavigate("editor-content")}
            className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            <Plus size={14} /> Training
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {CONTENT_TREE.map(({ product, modules }) => (
            <div key={product}>
              <div className="px-4 py-1.5 text-[11px] font-bold text-[#8A93A0] uppercase tracking-wider">{product}</div>
              {modules.map(mod => (
                <div key={mod.name}>
                  <button onClick={() => toggle(mod.name)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#3A424E] hover:bg-[#F6F8FA] transition-colors">
                    <ChevronRight size={14} className={`transition-transform text-[#8A93A0] ${openModules.has(mod.name) ? "rotate-90" : ""}`} />
                    {mod.name}
                  </button>
                  {openModules.has(mod.name) && mod.trainings.map(t => (
                    <button key={t.title} onClick={() => onNavigate("editor-content")}
                      className="w-full flex items-center gap-3 pl-10 pr-4 py-2 text-[13px] text-[#3A424E] hover:bg-[#E6FAF9] transition-colors group">
                      <FileText size={14} className="text-[#8A93A0] shrink-0" />
                      <span className="flex-1 text-left truncate group-hover:text-[#007D78]">{t.title}</span>
                      <StatusBadge status={t.status} compact />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center bg-[#F6F8FA]">
        <EmptyState
          icon={FileText}
          title="Training auswählen"
          body="Wählen Sie links ein Training zur Bearbeitung oder legen Sie ein neues an."
          action="Neues Training"
          onAction={() => onNavigate("editor-content")}
        />
      </div>
    </div>
  );
}

// ─── Editor: Content Editor ───────────────────────────────────────────────────

const ELEMENTS = [
  { type: "video",   icon: Play,        label: "Einführung DSR",              meta: "6:42 Min." },
  { type: "text",    icon: FileText,    label: "Systemeinstellungen (CDM)",   meta: "420 Zeichen" },
  { type: "steps",  icon: BookMarked,  label: "Grundkonfiguration",           meta: "4 Schritte" },
  { type: "image",  icon: Eye,         label: "Screenshot DSR-Hauptmenü",     meta: "Bild" },
];

function EditorContent({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [saved, setSaved] = useState("14:32");
  const [showPublish, setShowPublish] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(["DE", "AT", "CH"]);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);

  const publish = async () => {
    setPublishing(true);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 120));
      setPublishProgress(i);
    }
    setPublishing(false);
    setShowPublish(false);
    toast.success("Veröffentlicht · Übersetzung läuft");
  };

  const markets = ["DE", "AT", "CH", "FR", "ES", "IT", "PL", "NL", "BE", "PT", "CZ", "HU"];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Editor header */}
        <div className="bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => onNavigate("editor-tree")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#5A6472]">ServiceQ / DSR</div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-[#232830]">DSR – Konfiguration im Einzelhandel</h2>
              <StatusBadge status="draft" compact />
            </div>
          </div>
          <span className="text-[12px] text-[#5A6472] hidden md:block">Gespeichert {saved}</span>
          <button className="px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors flex items-center gap-1.5">
            <Eye size={14} /> Vorschau
          </button>
          <button onClick={() => setShowPublish(true)}
            className="px-4 py-2 rounded-lg font-semibold text-[13px] transition-all flex items-center gap-1.5"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            <Send size={14} /> Veröffentlichen
          </button>
        </div>

        {/* Two-column editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chapter list */}
          <div className="w-56 bg-white border-r border-[#E1E5EA] flex flex-col shrink-0 hidden lg:flex">
            <div className="p-3 border-b border-[#EEF1F4] text-[11px] font-bold text-[#8A93A0] uppercase tracking-wider">Kapitel</div>
            {["Überblick & Konfiguration", "Rollenzuweisung", "DealerData-Sync", "Serviceannahme", "Fehler & Logs"].map((ch, i) => (
              <button key={i}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 text-[13px] transition-colors relative ${i === 0 ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
                {i === 0 && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                <span className={`font-medium ${i === 0 ? "text-[#007D78]" : "text-[#3A424E]"}`}>{i + 1}. {ch}</span>
              </button>
            ))}
            <button className="m-3 flex items-center gap-2 justify-center px-3 py-2 rounded-lg border border-dashed border-[#C3C9D1] text-[12px] text-[#5A6472] hover:border-[#00C8C1] hover:text-[#007D78] transition-colors">
              <Plus size={14} /> Kapitel
            </button>
          </div>

          {/* Element canvas */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#F6F8FA]">
            <h3 className="text-[15px] font-semibold text-[#232830] mb-4">Kapitel 1: Überblick &amp; Konfigurationsebenen</h3>
            <div className="space-y-3">
              {ELEMENTS.map((el, i) => {
                const Icon = el.icon;
                return (
                  <div key={i} className="bg-white rounded-lg border border-[#C3C9D1] px-4 py-3 flex items-center gap-3 group hover:border-[#00C8C1] transition-all">
                    <button className="text-[#C3C9D1] cursor-grab hover:text-[#8A93A0] transition-colors"><GripVertical size={16} /></button>
                    <div className="w-7 h-7 rounded bg-[#F6F8FA] flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-[#5A6472]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-[#232830]">{el.label}</span>
                      <span className="text-[11px] text-[#8A93A0] ml-2">{el.meta}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-[#EEF1F4] transition-colors"><Eye size={14} className="text-[#5A6472]" /></button>
                      <button className="p-1.5 rounded hover:bg-[#EEF1F4] transition-colors" onClick={() => toast(`Element gelöscht · Rückgängig`, { action: { label: "Rückgängig", onClick: () => toast.success("Wiederhergestellt") } })}><Trash2 size={14} className="text-[#B42318]" /></button>
                    </div>
                    <MoreVertical size={16} className="text-[#C3C9D1] group-hover:text-[#8A93A0] transition-colors" />
                  </div>
                );
              })}

              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-[#C3C9D1] text-[13px] text-[#5A6472] hover:border-[#00C8C1] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-all">
                <Plus size={16} /> Element hinzufügen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Publish Panel */}
      {showPublish && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowPublish(false)} />
          <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full">
            <div className="px-6 py-4 border-b border-[#E1E5EA] flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#232830]">Veröffentlichen</h2>
              <button onClick={() => setShowPublish(false)} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Market selection */}
              <div>
                <label className="block text-[13px] font-semibold text-[#3A424E] mb-2">Märkte auswählen</label>
                <div className="flex flex-wrap gap-2">
                  {markets.map(m => (
                    <button key={m} onClick={() => setSelectedMarkets(s => s.includes(m) ? s.filter(x => x !== m) : [...s, m])}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${selectedMarkets.includes(m) ? "bg-[#E6FAF9] border-[#00C8C1] text-[#007D78]" : "bg-white border-[#C3C9D1] text-[#5A6472] hover:border-[#8A93A0]"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validation */}
              <div>
                <label className="block text-[13px] font-semibold text-[#3A424E] mb-2">Prüfliste</label>
                <div className="space-y-2">
                  {[
                    { ok: true, label: "Titel vorhanden" },
                    { ok: true, label: "Alle Kapitel haben mindestens ein Element" },
                    { ok: false, label: "Beschreibung fehlt (optional)" },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg ${item.ok ? "bg-[#EAF8F0] text-[#15803D]" : "bg-[#FDF3E4] text-[#B45309]"}`}>
                      {item.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Consequence */}
              <div className="bg-[#EBF1FE] rounded-lg px-4 py-3 text-[13px] text-[#1D5BD6]">
                Wird in <strong>{selectedMarkets.length} Sprachen</strong> übersetzt — ca. {selectedMarkets.length * 48} Textfelder werden zum Übersetzungslauf übergeben.
              </div>

              {/* Job progress if publishing */}
              {publishing && (
                <div>
                  <div className="text-[13px] font-semibold text-[#3A424E] mb-2">Übersetzungsjobs</div>
                  <ProgressBar percent={publishProgress} className="mb-1" />
                  <div className="text-[12px] text-[#5A6472]">{publishProgress}% abgeschlossen …</div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#E1E5EA]">
              <button onClick={publish} disabled={publishing}
                className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: publishing ? "#00B3AC" : "#00C8C1", color: "#232830" }}>
                {publishing ? <><span className="w-4 h-4 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" /> Wird veröffentlicht …</> : "Jetzt veröffentlichen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Translations Overview ────────────────────────────────────────────────────

const LANG_DATA = [
  { lang: "Französisch", code: "FR", total: 45, current: 42, outdated: 2, errors: 1 },
  { lang: "Spanisch",    code: "ES", total: 45, current: 45, outdated: 0, errors: 0 },
  { lang: "Polnisch",    code: "PL", total: 45, current: 38, outdated: 5, errors: 2 },
  { lang: "Italienisch", code: "IT", total: 45, current: 44, outdated: 1, errors: 0 },
  { lang: "Niederländisch", code: "NL", total: 45, current: 40, outdated: 3, errors: 2 },
  { lang: "Tschechisch", code: "CZ", total: 45, current: 45, outdated: 0, errors: 0 },
  { lang: "Ungarisch",   code: "HU", total: 45, current: 32, outdated: 8, errors: 5 },
  { lang: "Portugiesisch", code: "PT", total: 45, current: 41, outdated: 4, errors: 0 },
];

function TranslationsOverview({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const trainings = [
    { title: "DSR – Konfiguration im Einzelhandel", module: "DSR", urgentLangs: 3 },
    { title: "DSR – Rollenzuweisung und Berechtigungen", module: "DSR", urgentLangs: 0 },
    { title: "CCD – Grundkonfiguration", module: "CCD", urgentLangs: 2 },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <Breadcrumb items={["Redaktion", "Übersetzungen"]} />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-semibold text-[#232830]">Übersetzungen</h1>
            <p className="text-[14px] text-[#5A6472] mt-1">3 Trainings · 8 Sprachen</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C3C9D1] text-[13px] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
              <Filter size={14} /> Filter
            </button>
          </div>
        </div>

        {/* Training list */}
        <div className="space-y-3 mb-8">
          {trainings.length === 0 && (
            <div className="bg-white rounded-xl border border-[#C3C9D1]">
              <EmptyState
                icon={Languages}
                title="Alles aktuell"
                body="Alle Übersetzungen sind auf dem neuesten Stand. Sobald Inhalte geändert werden, erscheinen betroffene Felder hier."
              />
            </div>
          )}
          {trainings.map(t => (
            <div key={t.title} className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EEF1F4]">
                <div className="flex-1">
                  <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider mb-0.5">ServiceQ · {t.module}</div>
                  <h3 className="text-[15px] font-semibold text-[#232830]">{t.title}</h3>
                </div>
                {t.urgentLangs > 0 && (
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#FDF3E4] text-[#B45309]">
                    <AlertTriangle size={12} /> {t.urgentLangs} Sprachen mit Bedarf
                  </span>
                )}
              </div>
              <div className="divide-y divide-[#EEF1F4]">
                {LANG_DATA.slice(0, 4).map(l => (
                  <div key={l.code} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F6F8FA] transition-colors">
                    <div className="w-8 text-[12px] font-bold text-[#5A6472]">{l.code}</div>
                    <div className="w-24 text-[13px] text-[#3A424E]">{l.lang}</div>
                    <div className="flex-1">
                      <ProgressBar percent={Math.round((l.current / l.total) * 100)} />
                    </div>
                    <div className="text-[13px] text-[#5A6472] w-24 text-right">{l.current}/{l.total} aktuell</div>
                    <div className="flex gap-1.5 flex-wrap justify-end w-32">
                      {l.outdated > 0 && <StatusBadge status="outdated" compact />}
                      {l.errors > 0 && <StatusBadge status="error" compact />}
                      {l.outdated === 0 && l.errors === 0 && <StatusBadge status="published" compact />}
                    </div>
                    <button onClick={() => onNavigate("translations-review")}
                      className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-[#C3C9D1] text-[#3A424E] hover:border-[#00C8C1] hover:text-[#007D78] transition-all whitespace-nowrap">
                      Prüfen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Translation Review ───────────────────────────────────────────────────────

const REVIEW_FIELDS = [
  { id: 1, label: "Kap. 1 Titel",    master: "Überblick & Konfigurationsebenen", translation: "Aperçu et niveaux de configuration", status: "outdated" as Status, diff: "Konfigurationsebenen" },
  { id: 2, label: "Text 1.2",        master: "Bevor Sie beginnen, stellen Sie sicher, dass die DealerData-API-Zugangsdaten vorliegen.", translation: "Avant de commencer, assurez-vous que les informations d'identification de l'API DealerData sont disponibles.", status: "auto" as Status },
  { id: 3, label: "Schritt 3.1",    master: "Öffnen Sie das DSR-Verwaltungsmenü und navigieren Sie zu Einstellungen.", translation: "", status: "error" as Status },
  { id: 4, label: "Kap. 2 Titel",   master: "Rollenzuweisung im System", translation: "Attribution des rôles dans le système", status: "corrected" as Status },
  { id: 5, label: "Text 2.1",       master: "Die Rollenzuweisung erfolgt über das zentrale Benutzermenü.", translation: "L'attribution des rôles se fait via le menu utilisateur central.", status: "auto" as Status },
];

function TranslationReview({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [fields, setFields] = useState(REVIEW_FIELDS.map(f => ({ ...f, editValue: f.translation })));
  const [activeField, setActiveField] = useState(1);
  const [filter, setFilter] = useState<"all" | "outdated" | "error">("all");

  const saveField = (id: number) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, status: "corrected" as Status, translation: f.editValue } : f));
    const next = fields.find(f => f.id > id && (f.status === "outdated" || f.status === "error"));
    if (next) setActiveField(next.id);
    toast.success("Übersetzung gespeichert & gesperrt");
  };

  const visible = fields.filter(f => filter === "all" || f.status === filter);
  const currentCount = fields.filter(f => f.status === "corrected" || f.status === "auto").length;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-56 bg-white border-r border-[#E1E5EA] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#EEF1F4]">
          <div className="text-[11px] font-bold text-[#8A93A0] uppercase tracking-wider mb-2">Felder</div>
          <div className="flex flex-col gap-1">
            {(["all", "outdated", "error"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-left px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${filter === f ? "bg-[#E6FAF9] text-[#007D78]" : "text-[#5A6472] hover:bg-[#F6F8FA]"}`}>
                {f === "all" ? "Alle Felder" : f === "outdated" ? "Veraltet" : "Fehler"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {visible.map(f => (
            <button key={f.id} onClick={() => setActiveField(f.id)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors relative ${activeField === f.id ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
              {activeField === f.id && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
              <span style={{ color: STATUS[f.status].color, display: "flex" }}>{STATUS[f.status].icon}</span>
              <span className={`text-[12px] truncate ${activeField === f.id ? "text-[#007D78] font-semibold" : "text-[#3A424E]"}`}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => onNavigate("translations-overview")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4]"><ChevronLeft size={18} /></button>
          <div className="flex-1">
            <p className="text-[12px] text-[#5A6472]">DSR – Konfiguration im Einzelhandel</p>
            <p className="text-[14px] font-semibold text-[#232830]">Französisch (FR)</p>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-[#5A6472]">
            <span className="font-semibold text-[#007D78]">{currentCount}</span>/{fields.length} aktuell
          </div>
        </div>

        {/* Side-by-side */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 max-w-[900px]">
            <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider">Master (Deutsch)</div>
            <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider">Französisch (FR)</div>
          </div>
          <div className="max-w-[900px] space-y-4 mt-3">
            {visible.map(f => {
              const active = activeField === f.id;
              return (
                <div key={f.id} onClick={() => setActiveField(f.id)}
                  className={`grid grid-cols-2 gap-4 p-4 rounded-lg border transition-all cursor-pointer ${active ? "border-[#00C8C1] shadow-sm" : "border-[#E1E5EA] hover:border-[#C3C9D1]"}`}>
                  {/* Master */}
                  <div>
                    <div className="text-[11px] font-semibold text-[#8A93A0] mb-1">{f.label}</div>
                    <p className="text-[14px] text-[#3A424E] leading-relaxed bg-[#F6F8FA] rounded p-3">{f.master}</p>
                  </div>
                  {/* Translation */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={f.status} compact />
                    </div>
                    {active ? (
                      <div className="space-y-2">
                        <textarea
                          value={f.editValue}
                          onChange={e => setFields(prev => prev.map(fi => fi.id === f.id ? { ...fi, editValue: e.target.value } : fi))}
                          className="w-full rounded-lg border border-[#8A93A0] px-3 py-2.5 text-[14px] text-[#232830] resize-none leading-relaxed outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button onClick={e => { e.stopPropagation(); saveField(f.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                            <Lock size={12} /> Korrigieren &amp; sperren
                          </button>
                          <button onClick={e => { e.stopPropagation(); toast.info("Wird neu übersetzt …"); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[#C3C9D1] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
                            <RefreshCw size={12} /> Neu übersetzen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-[14px] leading-relaxed p-3 rounded ${f.status === "corrected" ? "bg-[#EAF8F0] text-[#15803D]" : f.status === "error" ? "bg-[#FDEEEC] text-[#B42318] italic" : "bg-[#F6F8FA] text-[#3A424E]"}`}>
                        {f.translation || <em className="text-[#B42318]">Übersetzung fehlgeschlagen – Klicken zum Bearbeiten</em>}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin: Users ─────────────────────────────────────────────────────────────

const USERS = [
  { name: "Maria Schmidt",  email: "m.schmidt@haendler-de.de",  role: "Anwender",  markets: ["DE", "AT"], lastActive: "Heute" },
  { name: "Jean Dupont",    email: "j.dupont@concessionnaire.fr", role: "Anwender", markets: ["FR", "BE"], lastActive: "Gestern" },
  { name: "Anna Kowalski",  email: "a.kowalski@dealer.pl",      role: "Anwender",  markets: ["PL"],       lastActive: "18.07.2026" },
  { name: "Max Keller",     email: "m.keller@groupit.de",       role: "Editor",    markets: ["DE", "AT", "CH", "FR"], lastActive: "Heute" },
  { name: "IT Administration", email: "it@groupit.de",          role: "Admin",     markets: ["Alle"],     lastActive: "Heute" },
];

function AdminUsers() {
  const [showPanel, setShowPanel] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = USERS.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["Verwaltung", "Benutzer"]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#232830]">Benutzer</h1>
          <p className="text-[14px] text-[#5A6472] mt-1">{USERS.length} Konten</p>
        </div>
        <button onClick={() => setShowPanel(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
          <Plus size={16} /> Benutzer anlegen
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A0]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name oder E-Mail …"
          className="w-full h-9 pl-9 pr-3 bg-white border border-[#C3C9D1] rounded-lg text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
              {["Name", "E-Mail", "Rolle", "Märkte", "Zuletzt aktiv", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF1F4]">
            {filtered.map(u => (
              <tr key={u.email} className="hover:bg-[#F6F8FA] transition-colors">
                <td className="px-4 py-3 font-medium text-[#232830]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                      {u.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    {u.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#5A6472]">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.role === "Admin" ? "bg-[#FDEEEC] text-[#B42318]" : u.role === "Editor" ? "bg-[#EBF1FE] text-[#1D5BD6]" : "bg-[#EEF1F4] text-[#5A6472]"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.markets.slice(0, 3).map(m => (
                      <span key={m} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF1F4] text-[#5A6472]">{m}</span>
                    ))}
                    {u.markets.length > 3 && <span className="text-[11px] text-[#8A93A0]">+{u.markets.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#5A6472]">{u.lastActive}</td>
                <td className="px-4 py-3">
                  <button className="p-1.5 rounded text-[#8A93A0] hover:text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><MoreVertical size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create panel */}
      {showPanel && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowPanel(false)} />
          <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full">
            <div className="px-6 py-4 border-b border-[#E1E5EA] flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#232830]">Neuen Benutzer anlegen</h2>
              <button onClick={() => setShowPanel(false)} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4]"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {[{ label: "Vollständiger Name", ph: "Maria Schmidt" }, { label: "E-Mail-Adresse", ph: "m.schmidt@haendler.de" }].map(f => (
                <div key={f.label}>
                  <label className="block text-[13px] font-medium text-[#3A424E] mb-1.5">{f.label}</label>
                  <input placeholder={f.ph} className="w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all" />
                </div>
              ))}
              <div>
                <label className="block text-[13px] font-medium text-[#3A424E] mb-1.5">Rolle</label>
                <select className="w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] bg-white outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all">
                  <option>Anwender</option><option>Editor</option><option>Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#3A424E] mb-2">Märkte</label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-[#8A93A0] min-h-[44px]">
                  {["DE", "AT", "CH"].map(m => (
                    <span key={m} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold bg-[#E6FAF9] text-[#007D78] border border-[#00C8C1]">
                      {m}<button className="ml-0.5 text-[#00C8C1] hover:text-[#B42318]"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#E1E5EA]">
              <button onClick={() => { setShowPanel(false); toast.success("Einladung gesendet"); }}
                className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                <Send size={16} /> Einladung senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin: Settings ──────────────────────────────────────────────────────────

function SettingsToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={enabled} onClick={() => onChange(!enabled)}
      className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009D97] focus-visible:ring-offset-2 cursor-pointer"
      style={{ backgroundColor: enabled ? "#00C8C1" : "#C3C9D1" }}
    >
      <span className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: enabled ? "translateX(20px)" : "translateX(0px)" }} />
    </button>
  );
}

function SettingsSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="h-9 px-3 pr-8 rounded-lg border border-[#8A93A0] text-[13px] text-[#232830] bg-white outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all appearance-none cursor-pointer"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A93A0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-4 border-b border-[#EEF1F4]">
      <h2 className="text-[15px] font-semibold text-[#232830]">{title}</h2>
      <p className="text-[13px] text-[#5A6472] mt-0.5">{description}</p>
    </div>
  );
}

function AdminSettings() {
  type SettingsTab = "api" | "platform" | "notifications" | "security";
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");
  const [keyEditing, setKeyEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; ts: string; ms: number } | null>(null);
  const [sourceLang, setSourceLang] = useState("Deutsch (DE)");
  const [autosave, setAutosave] = useState("30 Sekunden");
  const [sessionTimeout, setSessionTimeout] = useState("8 Stunden");
  const [translationModel, setTranslationModel] = useState("mistral-large-latest");
  const [glossaryEnabled, setGlossaryEnabled] = useState(true);
  const [glossaryTerms, setGlossaryTerms] = useState([
    { de: "Serviceannahme", context: "DSR" },
    { de: "DealerData", context: "System" },
    { de: "Fahrzeugannahme", context: "DSR" },
    { de: "Werkstattauftrag", context: "Allgemein" },
  ]);
  const [notifyPublish, setNotifyPublish] = useState(true);
  const [notifyTranslation, setNotifyTranslation] = useState(true);
  const [notifyErrors, setNotifyErrors] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(false);
  const [digestFreq, setDigestFreq] = useState("Wöchentlich");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [sessionSingle, setSessionSingle] = useState(true);

  const auditLog = [
    { ts: "21.07.2026, 09:14", user: "IT Administration", action: "API-Key rotiert", type: "security" },
    { ts: "20.07.2026, 16:42", user: "Max Keller", action: "Training veröffentlicht: DSR Konfiguration", type: "content" },
    { ts: "20.07.2026, 14:11", user: "IT Administration", action: "Markt HU hinzugefügt", type: "admin" },
    { ts: "19.07.2026, 11:03", user: "Max Keller", action: "Benutzer Anna Kowalski eingeladen", type: "admin" },
    { ts: "18.07.2026, 09:30", user: "IT Administration", action: "Mistral-Verbindung getestet", type: "security" },
  ];

  const runTest = async (fail = false) => {
    setTesting(true); setTestResult(null);
    await new Promise(r => setTimeout(r, 1400));
    setTesting(false);
    setTestResult(fail
      ? { ok: false, ts: "21.07.2026, 09:31", ms: 0 }
      : { ok: true, ts: "21.07.2026, 09:31", ms: 312 }
    );
  };

  const NAV: { id: SettingsTab; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: "api",           label: "Mistral AI",         icon: Sparkles,  badge: "Aktiv" },
    { id: "platform",      label: "Plattform",           icon: Settings },
    { id: "notifications", label: "Benachrichtigungen",  icon: Bell,      badge: "3 aktiv" },
    { id: "security",      label: "Sicherheit",          icon: Lock },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Page header */}
      <div className="px-6 lg:px-8 pt-6 pb-4 border-b border-[#E1E5EA] bg-white sticky top-0 z-10">
        <Breadcrumb items={["Verwaltung", "Einstellungen"]} />
        <h1 className="text-[24px] font-semibold text-[#232830]">Einstellungen</h1>
      </div>

      {/* Two-column layout */}
      <div className="flex min-h-full">

        {/* Left sidebar nav */}
        <div className="w-56 shrink-0 bg-white border-r border-[#E1E5EA] p-3 hidden md:block">
          <nav className="space-y-0.5 sticky top-[89px]">
            {NAV.map(({ id, label, icon: Icon, badge }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all relative ${activeTab === id ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
                {activeTab === id && <span className="absolute left-0 inset-y-1 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                <Icon size={17} style={{ color: activeTab === id ? "#00C8C1" : "#8A93A0" }} className="shrink-0" />
                <span className={`text-[13px] font-medium flex-1 ${activeTab === id ? "text-[#007D78]" : "text-[#3A424E]"}`}>{label}</span>
                {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${activeTab === id ? "bg-[#00C8C1]/20 text-[#007D78]" : "bg-[#EEF1F4] text-[#5A6472]"}`}>{badge}</span>}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile tab bar */}
        <div className="md:hidden w-full">
          <div className="flex border-b border-[#E1E5EA] bg-white px-4">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-3 text-[12px] font-medium border-b-2 transition-all -mb-px ${activeTab === id ? "border-[#00C8C1] text-[#007D78]" : "border-transparent text-[#5A6472]"}`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 p-6 lg:p-8 space-y-6 max-w-[680px]">

          {/* ── Mistral AI ── */}
          {activeTab === "api" && <>

            {/* Status card */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[#EEF1F4] flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#232830]">API-Verbindung</h2>
                  <p className="text-[13px] text-[#5A6472] mt-0.5">Mistral AI für automatische Übersetzungen aller Trainingsinhalte</p>
                </div>
                <span className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#EAF8F0] text-[#15803D]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] inline-block" />Verbunden
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#EEF1F4]">
                {[
                  { label: "Modell", value: "mistral-large" },
                  { label: "Letzte Nutzung", value: "Heute, 09:14" },
                  { label: "Übersetzt (30 Tage)", value: "4.820 Felder" },
                ].map(s => (
                  <div key={s.label} className="px-5 py-4">
                    <div className="text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide mb-1">{s.label}</div>
                    <div className="text-[14px] font-semibold text-[#232830]">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="API-Key" description="Wird verschlüsselt gespeichert und nie im Klartext angezeigt" />
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 px-4 py-3 bg-[#F6F8FA] rounded-lg border border-[#E1E5EA]">
                  <Lock size={14} className="text-[#8A93A0] shrink-0" />
                  <code className="flex-1 text-[14px] text-[#3A424E] tracking-widest font-mono">
                    sk&#8209;••••••••••••••••••••••••••••••a4f2
                  </code>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#15803D] font-semibold">
                    <CheckCircle2 size={13} />Aktiv
                  </div>
                </div>

                {keyEditing ? (
                  <div className="space-y-3 p-4 bg-[#F6F8FA] rounded-lg border border-[#E1E5EA]">
                    <label className="block text-[13px] font-semibold text-[#3A424E]">Neuer API-Key eingeben</label>
                    <input type="text" value={keyValue} onChange={e => setKeyValue(e.target.value)}
                      placeholder="sk-..." autoFocus
                      className="w-full h-10 px-3 rounded-lg border border-[#8A93A0] font-mono text-[14px] text-[#232830] placeholder:text-[#8A93A0] bg-white outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all" />
                    <p className="text-[12px] text-[#5A6472]">Der Key wird sofort verschlüsselt. Der aktuelle Key wird ungültig.</p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setKeyEditing(false); setKeyValue(""); toast.success("API-Key gespeichert und aktiviert"); }}
                        className="px-4 py-2 rounded-lg font-semibold text-[13px] transition-all"
                        style={{ backgroundColor: "#00C8C1", color: "#232830" }}>Speichern</button>
                      <button onClick={() => { setKeyEditing(false); setKeyValue(""); }}
                        className="px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setKeyEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
                    <RefreshCw size={14} />Key rotieren
                  </button>
                )}
              </div>
            </div>

            {/* Connection test */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Verbindungstest" description="Prüft Erreichbarkeit der Mistral-API und validiert den Key" />
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide mb-1.5">Modell</label>
                    <SettingsSelect value={translationModel}
                      options={["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"]}
                      onChange={setTranslationModel} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide mb-1.5">Endpunkt</label>
                    <div className="h-9 flex items-center px-3 rounded-lg border border-[#E1E5EA] bg-[#F6F8FA] font-mono text-[13px] text-[#5A6472]">api.mistral.ai/v1</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => runTest(false)} disabled={testing}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
                    style={{ backgroundColor: testing ? "#00B3AC" : "#00C8C1", color: "#232830" }}>
                    {testing
                      ? <><span className="w-3.5 h-3.5 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" />Verbindung wird getestet…</>
                      : <><RefreshCw size={14} />Verbindung testen</>}
                  </button>
                  {!testing && (
                    <button onClick={() => runTest(true)}
                      className="px-4 py-2.5 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#B42318] hover:bg-[#FDEEEC] transition-colors">
                      Fehler simulieren
                    </button>
                  )}
                </div>

                {testResult && (
                  <div className={`rounded-lg border overflow-hidden ${testResult.ok ? "border-[#15803D]/25 bg-[#EAF8F0]" : "border-[#B42318]/25 bg-[#FDEEEC]"}`}>
                    <div className={`flex items-center gap-2 px-4 py-3 border-b text-[13px] font-semibold ${testResult.ok ? "text-[#15803D] border-[#15803D]/15" : "text-[#B42318] border-[#B42318]/15"}`}>
                      {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      {testResult.ok ? "Verbindung erfolgreich" : "Verbindung fehlgeschlagen"}
                    </div>
                    <div className={`px-4 py-3 grid gap-x-6 gap-y-2 text-[12px] ${testResult.ok ? "grid-cols-3 text-[#15803D]" : "grid-cols-1 text-[#B42318]"}`}>
                      <div><span className="font-semibold block mb-0.5">Zeitstempel</span>{testResult.ts}</div>
                      {testResult.ok && <div><span className="font-semibold block mb-0.5">Latenz</span>{testResult.ms} ms</div>}
                      {testResult.ok && <div><span className="font-semibold block mb-0.5">Modell</span>{translationModel}</div>}
                      {!testResult.ok && <div><span className="font-semibold block mb-0.5">Fehlerursache</span>401 Unauthorized – Key ungültig oder abgelaufen. Bitte Key rotieren.</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Glossary */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[#EEF1F4] flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#232830]">Fachglossar</h2>
                  <p className="text-[13px] text-[#5A6472] mt-0.5">Begriffe, die bei der Übersetzung unverändert bleiben</p>
                </div>
                <SettingsToggle enabled={glossaryEnabled} onChange={setGlossaryEnabled} />
              </div>
              <div className={glossaryEnabled ? "" : "opacity-40 pointer-events-none"}>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#EEF1F4] bg-[#F6F8FA]">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Begriff (DE)</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Kontext</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Verhalten</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1F4]">
                    {glossaryTerms.map((t, i) => (
                      <tr key={i} className="hover:bg-[#F6F8FA] transition-colors group">
                        <td className="px-4 py-3 font-medium text-[#232830]">{t.de}</td>
                        <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#EEF1F4] text-[#5A6472]">{t.context}</span></td>
                        <td className="px-4 py-3 text-[#5A6472]">Nicht übersetzen</td>
                        <td className="px-4 py-3">
                          <button onClick={() => setGlossaryTerms(prev => prev.filter((_, j) => j !== i))}
                            className="p-1 rounded text-[#C3C9D1] hover:text-[#B42318] hover:bg-[#FDEEEC] transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-[#EEF1F4]">
                  <button onClick={() => setGlossaryTerms(prev => [...prev, { de: "Neuer Begriff", context: "Allgemein" }])}
                    className="flex items-center gap-1.5 text-[13px] font-medium text-[#007D78] hover:underline">
                    <Plus size={14} />Begriff hinzufügen
                  </button>
                </div>
              </div>
            </div>
          </>}

          {/* ── Plattform ── */}
          {activeTab === "platform" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Inhalte &amp; Sprache" description="Grundeinstellungen für die Erstellung von Trainingsinhalten" />
              <div className="divide-y divide-[#EEF1F4]">
                {[
                  { label: "Master-Sprache", desc: "Sprache, in der alle Inhalte primär erstellt werden", value: sourceLang, set: setSourceLang, opts: ["Deutsch (DE)", "Englisch (EN)", "Französisch (FR)"] },
                  { label: "Autosave-Intervall", desc: "Wie oft Änderungen im Editor automatisch gespeichert werden", value: autosave, set: setAutosave, opts: ["10 Sekunden", "30 Sekunden", "60 Sekunden", "Manuell"] },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-6 px-6 py-4">
                    <div className="flex-1">
                      <div className="text-[14px] font-medium text-[#232830]">{row.label}</div>
                      <div className="text-[12px] text-[#5A6472] mt-0.5">{row.desc}</div>
                    </div>
                    <SettingsSelect value={row.value} options={row.opts} onChange={row.set} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Sitzung &amp; Zugang" description="Einstellungen für Anmeldung und Inaktivitätszeitlimit" />
              <div className="divide-y divide-[#EEF1F4]">
                <div className="flex items-center justify-between gap-6 px-6 py-4">
                  <div>
                    <div className="text-[14px] font-medium text-[#232830]">Sitzungs-Timeout</div>
                    <div className="text-[12px] text-[#5A6472] mt-0.5">Automatische Abmeldung nach Inaktivität</div>
                  </div>
                  <SettingsSelect value={sessionTimeout} options={["2 Stunden", "4 Stunden", "8 Stunden", "24 Stunden"]} onChange={setSessionTimeout} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Plattform-Info" description="Versionsinformationen und aktuelle Systemkennzahlen" />
              <div className="divide-y divide-[#EEF1F4]">
                {[
                  { label: "Plattform-Version", value: "2.4.1" },
                  { label: "Letzte Aktualisierung", value: "18.07.2026" },
                  { label: "Aktive Märkte", value: "6 von 30" },
                  { label: "Aktive Benutzer (30 Tage)", value: "142" },
                  { label: "Gespeicherte Übersetzungsfelder", value: "1.240 in 8 Sprachen" },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-6 py-3.5">
                    <span className="text-[14px] text-[#5A6472]">{row.label}</span>
                    <span className="text-[14px] font-semibold text-[#232830] tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </>}

          {/* ── Benachrichtigungen ── */}
          {activeTab === "notifications" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="E-Mail-Benachrichtigungen" description="Wann werden Administratoren und Editoren automatisch informiert" />
              <div className="divide-y divide-[#EEF1F4]">
                {[
                  { label: "Training veröffentlicht", desc: "Nach jedem erfolgreichen Veröffentlichungsvorgang", state: notifyPublish, set: setNotifyPublish },
                  { label: "Übersetzungsjob abgeschlossen", desc: "Wenn alle Felder eines Laufs übersetzt wurden", state: notifyTranslation, set: setNotifyTranslation },
                  { label: "Übersetzungsfehler", desc: "Sofortige Meldung bei fehlgeschlagenen Feldern", state: notifyErrors, set: setNotifyErrors },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-6 px-6 py-4">
                    <div>
                      <div className="text-[14px] font-medium text-[#232830]">{row.label}</div>
                      <div className="text-[12px] text-[#5A6472] mt-0.5">{row.desc}</div>
                    </div>
                    <SettingsToggle enabled={row.state} onChange={row.set} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between gap-6 px-6 py-4 border-b border-[#EEF1F4]">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#232830]">Zusammenfassungs-Digest</h2>
                  <p className="text-[13px] text-[#5A6472] mt-0.5">Periodische E-Mail mit allen Aktivitäten der Plattform</p>
                </div>
                <SettingsToggle enabled={notifyDigest} onChange={setNotifyDigest} />
              </div>
              <div className={`px-6 py-4 flex items-center justify-between gap-6 ${!notifyDigest ? "opacity-40 pointer-events-none" : ""}`}>
                <div>
                  <div className="text-[14px] font-medium text-[#232830]">Häufigkeit</div>
                  <div className="text-[12px] text-[#5A6472] mt-0.5">Wird montags um 08:00 Uhr versendet</div>
                </div>
                <SettingsSelect value={digestFreq} options={["Täglich", "Wöchentlich", "Monatlich"]} onChange={setDigestFreq} />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={() => toast.success("Benachrichtigungseinstellungen gespeichert")}
                className="px-5 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                Speichern
              </button>
            </div>
          </>}

          {/* ── Sicherheit ── */}
          {activeTab === "security" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Anmeldesicherheit" description="Einstellungen zur Absicherung aller Benutzerkonten" />
              <div className="divide-y divide-[#EEF1F4]">
                <div className="flex items-center justify-between gap-6 px-6 py-4">
                  <div>
                    <div className="text-[14px] font-medium text-[#232830]">Zwei-Faktor-Authentifizierung (MFA)</div>
                    <div className="text-[12px] text-[#5A6472] mt-0.5">Alle Benutzer müssen MFA bei der Anmeldung verwenden</div>
                  </div>
                  <SettingsToggle enabled={mfaRequired} onChange={v => { setMfaRequired(v); toast(v ? "MFA für alle Benutzer aktiviert" : "MFA deaktiviert"); }} />
                </div>
                <div className="flex items-center justify-between gap-6 px-6 py-4">
                  <div>
                    <div className="text-[14px] font-medium text-[#232830]">Einzelne aktive Sitzung</div>
                    <div className="text-[12px] text-[#5A6472] mt-0.5">Alte Sitzungen werden bei Neuanmeldung automatisch beendet</div>
                  </div>
                  <SettingsToggle enabled={sessionSingle} onChange={setSessionSingle} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Aktivitätsprotokoll" description="Sicherheitsrelevante Ereignisse der letzten 30 Tage" />
              <div className="divide-y divide-[#EEF1F4]">
                {auditLog.map((entry, i) => {
                  const typeColor: Record<string, { dot: string; bg: string }> = {
                    security: { dot: "#B42318", bg: "#FDEEEC" },
                    content:  { dot: "#15803D", bg: "#EAF8F0" },
                    admin:    { dot: "#1D5BD6", bg: "#EBF1FE" },
                  };
                  const style = typeColor[entry.type] ?? { dot: "#8A93A0", bg: "#EEF1F4" };
                  return (
                    <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-[#F6F8FA] transition-colors">
                      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: style.bg }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: style.dot }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#232830] truncate">{entry.action}</div>
                        <div className="text-[11px] text-[#8A93A0] mt-0.5">{entry.user}</div>
                      </div>
                      <div className="text-[12px] text-[#8A93A0] tabular-nums shrink-0">{entry.ts}</div>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 border-t border-[#EEF1F4]">
                <button className="text-[13px] font-medium text-[#007D78] hover:underline">
                  Vollständiges Protokoll exportieren (CSV)
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#B42318]/25 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-[#FDEEEC] border-b border-[#B42318]/15">
                <AlertTriangle size={15} className="text-[#B42318]" />
                <span className="text-[13px] font-semibold text-[#B42318]">Gefahrenzone</span>
              </div>
              <div className="bg-white p-5 space-y-3">
                <p className="text-[13px] text-[#5A6472]">Diese Aktionen sind unwiderruflich und betreffen alle aktiven Benutzer. Nur nach Rücksprache mit der Projektleitung ausführen.</p>
                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => toast.error("Alle Sitzungen beendet – Benutzer müssen sich neu anmelden.")}
                    className="px-4 py-2 rounded-lg border border-[#B42318] text-[13px] font-semibold text-[#B42318] hover:bg-[#B42318] hover:text-white transition-all">
                    Alle Sitzungen beenden
                  </button>
                  <button onClick={() => toast.error("Diese Aktion erfordert schriftliche Bestätigung per E-Mail.")}
                    className="px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#5A6472] hover:bg-[#EEF1F4] transition-colors">
                    Plattform-Cache leeren
                  </button>
                </div>
              </div>
            </div>
          </>}

        </div>{/* right content */}
      </div>{/* two-column */}
    </div>
  );
}

// ─── Admin: Markets ───────────────────────────────────────────────────────────

function AdminMarkets() {
  const markets = [
    { name: "Deutschland", code: "DE", langs: ["DE"], default: "DE", trainings: 12 },
    { name: "Österreich",  code: "AT", langs: ["DE"],  default: "DE", trainings: 12 },
    { name: "Frankreich",  code: "FR", langs: ["FR", "DE"], default: "FR", trainings: 10 },
    { name: "Polen",       code: "PL", langs: ["PL", "DE"], default: "PL", trainings: 8 },
    { name: "Spanien",     code: "ES", langs: ["ES", "DE"], default: "ES", trainings: 9 },
    { name: "Ungarn",      code: "HU", langs: ["HU", "DE"], default: "HU", trainings: 6 },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["Verwaltung", "Märkte & Sprachen"]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#232830]">Märkte &amp; Sprachen</h1>
          <p className="text-[14px] text-[#5A6472] mt-1">{markets.length} aktive Märkte</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
          <Plus size={16} /> Markt anlegen
        </button>
      </div>
      <div className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
              {["Markt", "Code", "Sprachen", "Standardsprache", "Trainings", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF1F4]">
            {markets.map(m => (
              <tr key={m.code} className="hover:bg-[#F6F8FA] transition-colors">
                <td className="px-4 py-3 font-medium text-[#232830]">{m.name}</td>
                <td className="px-4 py-3"><span className="font-mono text-[12px] font-bold text-[#5A6472] bg-[#EEF1F4] px-1.5 py-0.5 rounded">{m.code}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {m.langs.map(l => <span key={l} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#E6FAF9] text-[#007D78]">{l}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#3A424E]">{m.default}</td>
                <td className="px-4 py-3 tabular-nums text-[#5A6472]">{m.trainings}</td>
                <td className="px-4 py-3"><button className="p-1.5 rounded text-[#8A93A0] hover:text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><MoreVertical size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────

const BOTTOM_NAV = [
  { id: "dashboard",  label: "Start",   icon: Home },
  { id: "catalog",    label: "Katalog", icon: BookOpen },
  { id: "search",     label: "Suche",   icon: Search },
  { id: "profile",    label: "Profil",  icon: User },
];

function MobileBottomNav({ current, onNavigate }: { current: Screen; onNavigate: (s: Screen) => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const isActive = (id: string) => current === id || (id === "dashboard" && current === "dashboard");

  return (
    <>
      {profileOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 mx-4 bg-white rounded-xl border border-[#C3C9D1] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EEF1F4]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[13px] font-bold">MK</div>
                <div>
                  <div className="text-[14px] font-semibold text-[#232830]">Max Keller</div>
                  <div className="text-[12px] text-[#5A6472]">Editor · Admin</div>
                </div>
              </div>
            </div>
            <div className="py-1">
              {[
                { label: "Inhalte", icon: FileText, screen: "editor-tree" as Screen },
                { label: "Übersetzungen", icon: Languages, screen: "translations-overview" as Screen },
                { label: "Benutzer", icon: Users, screen: "admin-users" as Screen },
                { label: "Einstellungen", icon: Settings, screen: "admin-settings" as Screen },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.label}
                    onClick={() => { onNavigate(item.screen); setProfileOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[14px] text-[#3A424E] hover:bg-[#E6FAF9] hover:text-[#007D78] transition-colors">
                    <Icon size={17} />{item.label}
                  </button>
                );
              })}
              <div className="border-t border-[#EEF1F4] mt-1 pt-1">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-[14px] text-[#B42318] hover:bg-[#FDEEEC] transition-colors">
                  <LogOut size={17} />Abmelden
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E1E5EA] flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {BOTTOM_NAV.map(({ id, label, icon: Icon }) => {
          const active = isActive(id) || (id === "profile" && profileOpen);
          return (
            <button key={id}
              onClick={() => id === "profile" ? setProfileOpen(!profileOpen) : id === "search" ? undefined : onNavigate(id as Screen)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              aria-label={label}
            >
              <Icon size={22} style={{ color: active ? "#00C8C1" : "#8A93A0" }} />
              <span className={`text-[10px] font-medium ${active ? "text-[#007D78]" : "text-[#8A93A0]"}`}>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, body, action, onAction }: {
  icon: React.ElementType; title: string; body: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#EEF1F4] flex items-center justify-center mb-4">
        <Icon size={28} style={{ color: "#C3C9D1" }} strokeWidth={1.5} />
      </div>
      <h3 className="text-[16px] font-semibold text-[#3A424E] mb-2">{title}</h3>
      <p className="text-[14px] text-[#5A6472] max-w-xs mb-6">{body}</p>
      {action && onAction && (
        <button onClick={onAction}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
          <Plus size={16} />{action}
        </button>
      )}
    </div>
  );
}

// ─── App Shell + Main ─────────────────────────────────────────────────────────

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!loggedIn) return (
    <>
      <LoginScreen onLogin={() => setLoggedIn(true)} />
      <Toaster position="bottom-right" />
    </>
  );

  const renderScreen = () => {
    switch (screen) {
      case "dashboard":            return <Dashboard onNavigate={setScreen} />;
      case "catalog":              return <Catalog onNavigate={setScreen} />;
      case "training-overview":    return <TrainingOverview onNavigate={setScreen} />;
      case "learning":             return <LearningView onNavigate={setScreen} />;
      case "editor-tree":          return <EditorTree onNavigate={setScreen} />;
      case "editor-content":       return <EditorContent onNavigate={setScreen} />;
      case "translations-overview":return <TranslationsOverview onNavigate={setScreen} />;
      case "translations-review":  return <TranslationReview onNavigate={setScreen} />;
      case "admin-users":          return <AdminUsers />;
      case "admin-markets":        return <AdminMarkets />;
      case "admin-settings":       return <AdminSettings />;
      default:                     return <Dashboard onNavigate={setScreen} />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif", backgroundColor: "#F6F8FA" }}>
      <Toaster position="bottom-right" richColors />
      <Topbar onMenuToggle={() => setMobileOpen(!mobileOpen)} collapsed={collapsed} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex">
          <Sidebar current={screen} onNavigate={setScreen} collapsed={collapsed} />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
            <Sidebar current={screen} onNavigate={setScreen} collapsed={false} mobile onClose={() => setMobileOpen(false)} />
          </>
        )}

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute left-0 bottom-8 z-10 items-center justify-center w-5 h-8 bg-white border border-[#C3C9D1] rounded-r-md text-[#8A93A0] hover:text-[#5A6472] transition-colors"
          style={{ left: collapsed ? 72 : 256, transition: "left 0.2s" }}
          aria-label="Sidebar ein-/ausklappen"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Content */}
        <main className="flex-1 flex overflow-hidden pb-16 lg:pb-0">
          {renderScreen()}
        </main>
      </div>

      <MobileBottomNav current={screen} onNavigate={setScreen} />
    </div>
  );
}
