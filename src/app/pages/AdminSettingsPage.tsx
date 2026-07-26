import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, Check, CheckCircle2, Download, Info, Lock, Plus,
  RefreshCw, Settings, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "../components/Breadcrumb";
import { fetchAppSettings, saveAppSetting } from "../data/api";
import { ROLE_LABELS, type Role } from "../data/roles";
import { UI_LANGUAGES, useT } from "../i18n";

// ─── Admin: Settings ──────────────────────────────────────────────────────────
// Alle Schalter mit hinterlegtem Schlüssel schreiben sofort in `app_setting`
// (optimistisch, Rücknahme bei Fehler). Steuerelemente ohne Schlüssel sind als
// „noch nicht gespeichert" gekennzeichnet – nichts täuscht eine Speicherung vor.
// Geheimnisse (Mistral-Key) gehören nicht in `app_setting`, sondern als
// Supabase-Secret zum Worker (docs/uebersetzung-worker.md).

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";

// ─── Persistierte Schlüssel (app_setting) ────────────────────────────────────

const KEYS = {
  autoOnPublish: "translation.auto_on_publish",
  glossary: "translation.glossary_enabled",
  model: "translation.model",
  masterLanguage: "translation.master_language",
  defaultRole: "platform.default_role",
  uiLanguages: "platform.ui_languages",
  notifyError: "notify.on_translation_error",
  notifyPublish: "notify.on_publish",
} as const;

type Persisted = {
  autoOnPublish: boolean;
  glossary: boolean;
  model: string;
  masterLanguage: string;
  defaultRole: string;
  uiLanguages: string[];
  notifyError: boolean;
  notifyPublish: boolean;
};

const DEFAULTS: Persisted = {
  autoOnPublish: true,
  glossary: true,
  model: "mistral-large-latest",
  masterLanguage: "de",
  defaultRole: "user",
  uiLanguages: ["de", "en", "fr"],
  notifyError: true,
  notifyPublish: true,
};

const MASTER_LANGUAGES = [
  { code: "de", label: "Deutsch (DE)" },
  { code: "en", label: "Englisch (EN)" },
  { code: "fr", label: "Französisch (FR)" },
];
const MODELS = ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"];
const ROLE_OPTIONS: Role[] = ["user", "editor", "admin"];

const asBool = (v: unknown, fb: boolean) =>
  typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : fb;
const asStr = (v: unknown, fb: string) => (typeof v === "string" && v ? v : fb);
const asArr = (v: unknown, fb: string[]) => (Array.isArray(v) && v.length ? v.map(String) : fb);

// ─── Bausteine ────────────────────────────────────────────────────────────────

function SettingsToggle({ enabled, onChange, label, disabled = false }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={enabled} aria-label={label} disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009D97] focus-visible:ring-offset-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      style={{ backgroundColor: enabled ? "#00C8C1" : "#C3C9D1" }}
    >
      <span className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: enabled ? "translateX(20px)" : "translateX(0px)" }} />
    </button>
  );
}

function SettingsSelect({ value, options, onChange, label, disabled = false }: {
  value: string; options: string[]; onChange: (v: string) => void; label: string; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} disabled={disabled}
      className={`h-9 px-3 pr-8 rounded-lg border border-[#8A93A0] text-[13px] text-[#232830] bg-white outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all appearance-none ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
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

/** Hinweis für Steuerelemente ohne hinterlegten Schlüssel. */
function NotStored() {
  return <span className="text-[11px] font-normal text-[#8A93A0] whitespace-nowrap">(noch nicht gespeichert)</span>;
}

function Row({ label, desc, notStored = false, children }: {
  label: string; desc: string; notStored?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="text-[14px] font-medium text-[#232830] flex items-center gap-2 flex-wrap">
          {label}{notStored && <NotStored />}
        </div>
        <div className="text-[12px] text-[#5A6472] mt-0.5">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Seite ────────────────────────────────────────────────────────────────────

export function AdminSettings() {
  const { t } = useT();
  type SettingsTab = "api" | "platform" | "notifications" | "security";
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  // Persistierte Einstellungen
  const [settings, setSettings] = useState<Persisted>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(false);

  // Nur lokal (kein Schlüssel in app_setting)
  const [keyPanel, setKeyPanel] = useState(false);
  const [autosave, setAutosave] = useState("30 Sekunden");
  const [sessionTimeout, setSessionTimeout] = useState("8 Stunden");
  const [notifyJobDone, setNotifyJobDone] = useState(true);
  const [notifyDigest, setNotifyDigest] = useState(false);
  const [digestFreq, setDigestFreq] = useState("Wöchentlich");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [sessionSingle, setSessionSingle] = useState(true);
  const [glossaryTerms, setGlossaryTerms] = useState([
    { de: "Serviceannahme", context: "DSR" },
    { de: "DealerData", context: "System" },
    { de: "Fahrzeugannahme", context: "DSR" },
    { de: "Werkstattauftrag", context: "Allgemein" },
  ]);

  useEffect(() => {
    let alive = true;
    fetchAppSettings()
      .then(raw => {
        if (!alive) return;
        if (raw) {
          setDbReady(true);
          setSettings(prev => ({
            autoOnPublish: asBool(raw[KEYS.autoOnPublish], prev.autoOnPublish),
            glossary: asBool(raw[KEYS.glossary], prev.glossary),
            model: asStr(raw[KEYS.model], prev.model),
            masterLanguage: asStr(raw[KEYS.masterLanguage], prev.masterLanguage),
            defaultRole: asStr(raw[KEYS.defaultRole], prev.defaultRole),
            uiLanguages: asArr(raw[KEYS.uiLanguages], prev.uiLanguages),
            notifyError: asBool(raw[KEYS.notifyError], prev.notifyError),
            notifyPublish: asBool(raw[KEYS.notifyPublish], prev.notifyPublish),
          }));
        }
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  /** Optimistisch setzen, danach speichern; bei Fehler zurücknehmen. */
  async function persist<K extends keyof Persisted>(field: K, value: Persisted[K]) {
    const previous = settings[field];
    setSettings(s => ({ ...s, [field]: value } as Persisted));
    if (!dbReady) {
      toast(`${t("common.dbRequired")} – die Änderung gilt nur in dieser Sitzung.`);
      return;
    }
    const ok = await saveAppSetting(KEYS[field], value);
    if (ok) {
      toast.success(t("common.saved"));
    } else {
      setSettings(s => ({ ...s, [field]: previous } as Persisted));
      toast.error(t("common.saveError"));
    }
  }

  const auditLog = [
    { ts: "21.07.2026, 09:14", user: "IT Administration", action: "API-Key rotiert", type: "security" },
    { ts: "20.07.2026, 16:42", user: "Max Keller", action: "Training veröffentlicht: DSR Konfiguration", type: "content" },
    { ts: "20.07.2026, 14:11", user: "IT Administration", action: "Markt HU hinzugefügt", type: "admin" },
    { ts: "19.07.2026, 11:03", user: "Max Keller", action: "Benutzer Anna Kowalski eingeladen", type: "admin" },
    { ts: "18.07.2026, 09:30", user: "IT Administration", action: "Mistral-Verbindung getestet", type: "security" },
  ];

  /** Echter Client-Export der angezeigten Protokollzeilen (CSV, Excel-freundlich). */
  const exportAuditCsv = () => {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["Zeitstempel", "Benutzer", "Aktion", "Kategorie"];
    const csv = [header, ...auditLog.map(e => [e.ts, e.user, e.action, e.type])]
      .map(row => row.map(esc).join(";"))
      .join("\r\n");
    // BOM, damit Excel UTF-8 (Umlaute) korrekt erkennt
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aktivitaetsprotokoll-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${auditLog.length} Einträge als CSV exportiert`);
  };

  const activeNotifications = [settings.notifyPublish, settings.notifyError, notifyJobDone, notifyDigest]
    .filter(Boolean).length;

  const NAV: { id: SettingsTab; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: "api",           label: "Mistral AI",         icon: Sparkles, badge: settings.autoOnPublish ? "Auto" : undefined },
    { id: "platform",      label: "Plattform",          icon: Settings },
    { id: "notifications", label: "Benachrichtigungen",  icon: Bell,     badge: `${activeNotifications} aktiv` },
    { id: "security",      label: "Sicherheit",         icon: Lock },
  ];

  const masterLabel = MASTER_LANGUAGES.find(l => l.code === settings.masterLanguage)?.label ?? MASTER_LANGUAGES[0].label;
  const roleLabel = ROLE_LABELS[settings.defaultRole as Role] ?? ROLE_LABELS.user;

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
              <button key={id} onClick={() => setActiveTab(id)} type="button"
                aria-current={activeTab === id ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all relative ${FOCUS} ${activeTab === id ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
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
          <div className="flex border-b border-[#E1E5EA] bg-white px-4 overflow-x-auto">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} type="button"
                className={`flex items-center gap-1.5 px-3 py-3 text-[12px] font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${FOCUS} ${activeTab === id ? "border-[#00C8C1] text-[#007D78]" : "border-transparent text-[#5A6472]"}`}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 p-6 lg:p-8 space-y-6 max-w-[680px]">

          {/* Ladezustand / Speicherfähigkeit */}
          {loading && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#F6F8FA] border border-[#E1E5EA] text-[13px] text-[#5A6472]">
              <span className="w-3.5 h-3.5 border-2 border-[#C3C9D1] border-t-[#00C8C1] rounded-full animate-spin" aria-hidden="true" />
              {t("common.loading")}
            </div>
          )}
          {!loading && !dbReady && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#FDF3E4] border border-[#B45309]/25">
              <AlertTriangle size={15} className="text-[#B45309] shrink-0 mt-0.5" />
              <p className="text-[13px] text-[#B45309] leading-snug">
                {t("common.dbRequired")} – die Werte unten sind Vorgaben. Änderungen bleiben nur in dieser Sitzung erhalten.
              </p>
            </div>
          )}

          {/* ── Mistral AI ── */}
          {activeTab === "api" && <>

            {/* Status card */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[#EEF1F4] flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#232830]">API-Verbindung</h2>
                  <p className="text-[13px] text-[#5A6472] mt-0.5">Mistral AI für automatische Übersetzungen aller Trainingsinhalte</p>
                </div>
                <span className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#EEF1F4] text-[#5A6472]">
                  <Lock size={12} />Serverseitig verwaltet
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#EEF1F4]">
                {[
                  { label: "Modell", value: settings.model, demo: false },
                  { label: "Letzte Nutzung", value: "Heute, 09:14", demo: true },
                  { label: "Übersetzt (30 Tage)", value: "4.820 Felder", demo: true },
                ].map(s => (
                  <div key={s.label} className="px-5 py-4">
                    <div className="text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide mb-1">{s.label}</div>
                    <div className="text-[14px] font-semibold text-[#232830] flex items-center gap-2 flex-wrap">
                      {s.value}
                      {s.demo && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF1F4] text-[#5A6472]">Demo-Wert</span>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="px-5 pb-4 text-[12px] text-[#8A93A0]">
                Nutzungszahlen liefert der Worker; bis zu seinem Deployment stehen hier Platzhalter.
              </p>
            </div>

            {/* API Key – bleibt maskiert und wird von dieser Oberfläche nicht gespeichert */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="API-Key" description="Liegt ausschließlich als Supabase-Secret beim Worker – nie im Browser, nie in app_setting" />
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 px-4 py-3 bg-[#F6F8FA] rounded-lg border border-[#E1E5EA] flex-wrap">
                  <Lock size={14} className="text-[#8A93A0] shrink-0" />
                  <code className="flex-1 min-w-[160px] text-[14px] text-[#3A424E] tracking-widest font-mono">
                    sk&#8209;••••••••••••••••••••••••••••••••
                  </code>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#5A6472] font-semibold">
                    <CheckCircle2 size={13} />Nur serverseitig sichtbar
                  </div>
                </div>

                {keyPanel ? (
                  <div className="space-y-3 p-4 bg-[#F6F8FA] rounded-lg border border-[#E1E5EA]">
                    <h3 className="text-[13px] font-semibold text-[#3A424E]">Key rotieren</h3>
                    <p className="text-[12px] text-[#5A6472]">
                      Der Schlüssel wird nicht über diese Oberfläche eingegeben – sie würde ihn sonst durch den Browser tragen.
                      Rotation erfolgt als Supabase-Secret:
                    </p>
                    <pre className="overflow-x-auto rounded-lg border border-[#E1E5EA] bg-white px-3 py-2.5 font-mono text-[12px] text-[#232830]">
supabase secrets set MISTRAL_API_KEY=&lt;neuer-key&gt;
supabase functions deploy translate-training</pre>
                    <p className="text-[12px] text-[#5A6472]">
                      Vollständige Anleitung: <span className="font-mono text-[#3A424E]">docs/uebersetzung-worker.md</span>
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setKeyPanel(false)}
                        className={`px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                        {t("common.close")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setKeyPanel(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                    <RefreshCw size={14} />Key rotieren
                  </button>
                )}
              </div>
            </div>

            {/* Übersetzungsautomatik – persistiert */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Übersetzungsautomatik" description="Steuert, wann und mit welchem Modell der Worker übersetzt" />
              <div className="divide-y divide-[#EEF1F4]">
                <Row label="Automatisch übersetzen bei Veröffentlichung"
                  desc="Startet den Übersetzungslauf für alle Marktsprachen, sobald ein Training veröffentlicht wird">
                  <SettingsToggle label="Automatisch übersetzen bei Veröffentlichung" disabled={loading}
                    enabled={settings.autoOnPublish} onChange={v => persist("autoOnPublish", v)} />
                </Row>
                <Row label="Übersetzungsmodell" desc="Wird für alle neuen Läufe verwendet; laufende Jobs bleiben unberührt">
                  <SettingsSelect label="Übersetzungsmodell" disabled={loading}
                    value={settings.model} options={MODELS} onChange={v => persist("model", v)} />
                </Row>
                <div className="px-6 py-4">
                  <div className="text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide mb-1.5">Endpunkt</div>
                  <div className="h-9 flex items-center px-3 rounded-lg border border-[#E1E5EA] bg-[#F6F8FA] font-mono text-[13px] text-[#5A6472] overflow-x-auto">api.mistral.ai/v1</div>
                </div>
              </div>
            </div>

            {/* Verbindungstest – kein simuliertes Ergebnis mehr */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Verbindungstest" description="Prüft Erreichbarkeit der Mistral-API – läuft ausschließlich serverseitig" />
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#EBF1FE] border border-[#1D5BD6]/20">
                  <Info size={15} className="text-[#1D5BD6] shrink-0 mt-0.5" />
                  <p className="text-[13px] text-[#1D5BD6] leading-snug">
                    Der Test kann nicht im Browser laufen: Der Mistral-Key liegt als Supabase-Secret bei der Edge Function{" "}
                    <span className="font-mono">translate-training</span>. Sobald der Worker deployt ist, meldet er Erreichbarkeit,
                    Modell und Latenz zurück – bis dahin werden hier bewusst keine Messwerte angezeigt.
                    Anleitung: <span className="font-mono">docs/uebersetzung-worker.md</span>
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" disabled aria-describedby="conn-test-hint"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-[#C3C9D1] text-[#8A93A0] bg-[#F6F8FA] cursor-not-allowed">
                    <RefreshCw size={14} />Verbindung testen
                  </button>
                  <span id="conn-test-hint" className="text-[12px] text-[#5A6472]">
                    Verfügbar, sobald der Worker deployt ist
                  </span>
                </div>
              </div>
            </div>

            {/* Glossary */}
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[#EEF1F4] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#232830]">Fachglossar</h2>
                  <p className="text-[13px] text-[#5A6472] mt-0.5">Begriffe, die bei der Übersetzung unverändert bleiben</p>
                </div>
                <SettingsToggle label="Fachglossar verwenden" disabled={loading}
                  enabled={settings.glossary} onChange={v => persist("glossary", v)} />
              </div>
              <div className={settings.glossary ? "" : "opacity-40 pointer-events-none"}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#EEF1F4] bg-[#F6F8FA]">
                        <th scope="col" className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Begriff (DE)</th>
                        <th scope="col" className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Kontext</th>
                        <th scope="col" className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Verhalten</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF1F4]">
                      {glossaryTerms.map((term, i) => (
                        <tr key={i} className="hover:bg-[#F6F8FA] transition-colors group">
                          <td className="px-4 py-3 font-medium text-[#232830]">{term.de}</td>
                          <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#EEF1F4] text-[#5A6472]">{term.context}</span></td>
                          <td className="px-4 py-3 text-[#5A6472]">Nicht übersetzen</td>
                          <td className="px-4 py-3">
                            <button type="button" aria-label={`Begriff ${term.de} entfernen`}
                              onClick={() => setGlossaryTerms(prev => prev.filter((_, j) => j !== i))}
                              className={`p-1 rounded text-[#C3C9D1] hover:text-[#B42318] hover:bg-[#FDEEEC] transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS}`}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-[#EEF1F4] flex items-center gap-3 flex-wrap">
                  <button type="button" onClick={() => setGlossaryTerms(prev => [...prev, { de: "Neuer Begriff", context: "Allgemein" }])}
                    className={`flex items-center gap-1.5 text-[13px] font-medium text-[#007D78] hover:underline rounded ${FOCUS}`}>
                    <Plus size={14} />Begriff hinzufügen
                  </button>
                  <span className="text-[11px] text-[#8A93A0]">Begriffsliste: noch nicht gespeichert</span>
                </div>
              </div>
            </div>
          </>}

          {/* ── Plattform ── */}
          {activeTab === "platform" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Inhalte &amp; Sprache" description="Grundeinstellungen für die Erstellung von Trainingsinhalten" />
              <div className="divide-y divide-[#EEF1F4]">
                <Row label="Master-Sprache" desc="Sprache, in der alle Inhalte primär erstellt werden">
                  <SettingsSelect label="Master-Sprache" disabled={loading} value={masterLabel}
                    options={MASTER_LANGUAGES.map(l => l.label)}
                    onChange={labelValue => {
                      const code = MASTER_LANGUAGES.find(l => l.label === labelValue)?.code ?? "de";
                      persist("masterLanguage", code);
                    }} />
                </Row>
                <Row label="Autosave-Intervall" notStored desc="Wie oft Änderungen im Editor automatisch gespeichert werden">
                  <SettingsSelect label="Autosave-Intervall" value={autosave}
                    options={["10 Sekunden", "30 Sekunden", "60 Sekunden", "Manuell"]} onChange={setAutosave} />
                </Row>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Benutzer &amp; Oberfläche" description="Vorgaben für neu angelegte Benutzerkonten" />
              <div className="divide-y divide-[#EEF1F4]">
                <Row label="Standardrolle" desc="Rolle, die neue Benutzer ohne weitere Zuweisung erhalten">
                  <SettingsSelect label="Standardrolle" disabled={loading} value={roleLabel}
                    options={ROLE_OPTIONS.map(r => ROLE_LABELS[r])}
                    onChange={labelValue => {
                      const role = ROLE_OPTIONS.find(r => ROLE_LABELS[r] === labelValue) ?? "user";
                      persist("defaultRole", role);
                    }} />
                </Row>
                <div className="px-6 py-4">
                  <div className="text-[14px] font-medium text-[#232830]">Verfügbare Oberflächensprachen</div>
                  <div className="text-[12px] text-[#5A6472] mt-0.5 mb-3">Sprachen, die Benutzer für die Bedienoberfläche wählen können</div>
                  <div className="flex gap-2 flex-wrap" role="group" aria-label="Verfügbare Oberflächensprachen">
                    {UI_LANGUAGES.map(l => {
                      const on = settings.uiLanguages.includes(l.code);
                      return (
                        <button key={l.code} type="button" disabled={loading} aria-pressed={on}
                          onClick={() => {
                            const next = on
                              ? settings.uiLanguages.filter(c => c !== l.code)
                              : [...settings.uiLanguages, l.code];
                            if (!next.length) { toast("Mindestens eine Sprache muss aktiv bleiben."); return; }
                            persist("uiLanguages", next);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-all ${FOCUS} ${
                            on ? "border-[#00C8C1] bg-[#E6FAF9] text-[#007D78]" : "border-[#C3C9D1] text-[#3A424E] hover:bg-[#EEF1F4]"
                          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}>
                          {on ? <Check size={13} /> : <Plus size={13} />}{l.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Sitzung &amp; Zugang" description="Einstellungen für Anmeldung und Inaktivitätszeitlimit" />
              <div className="divide-y divide-[#EEF1F4]">
                <Row label="Sitzungs-Timeout" notStored desc="Automatische Abmeldung nach Inaktivität">
                  <SettingsSelect label="Sitzungs-Timeout" value={sessionTimeout}
                    options={["2 Stunden", "4 Stunden", "8 Stunden", "24 Stunden"]} onChange={setSessionTimeout} />
                </Row>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Plattform-Info" description="Versionsinformationen und Systemkennzahlen" />
              <div className="divide-y divide-[#EEF1F4]">
                {[
                  { label: "Plattform-Version", value: "2.4.1" },
                  { label: "Letzte Aktualisierung", value: "18.07.2026" },
                  { label: "Aktive Märkte", value: "6 von 30" },
                  { label: "Aktive Benutzer (30 Tage)", value: "142" },
                  { label: "Gespeicherte Übersetzungsfelder", value: "1.240 in 8 Sprachen" },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <span className="text-[14px] text-[#5A6472]">{row.label}</span>
                    <span className="text-[14px] font-semibold text-[#232830] tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="px-6 py-3 border-t border-[#EEF1F4] text-[12px] text-[#8A93A0]">
                Demo-Werte. Belastbare Kennzahlen stehen unter Verwaltung → Auswertungen.
              </p>
            </div>
          </>}

          {/* ── Benachrichtigungen ── */}
          {activeTab === "notifications" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="E-Mail-Benachrichtigungen" description="Wann werden Administratoren und Editoren automatisch informiert" />
              <div className="divide-y divide-[#EEF1F4]">
                <Row label="Training veröffentlicht" desc="Nach jedem erfolgreichen Veröffentlichungsvorgang">
                  <SettingsToggle label="Benachrichtigung: Training veröffentlicht" disabled={loading}
                    enabled={settings.notifyPublish} onChange={v => persist("notifyPublish", v)} />
                </Row>
                <Row label="Übersetzungsjob abgeschlossen" notStored desc="Wenn alle Felder eines Laufs übersetzt wurden">
                  <SettingsToggle label="Benachrichtigung: Übersetzungsjob abgeschlossen"
                    enabled={notifyJobDone} onChange={setNotifyJobDone} />
                </Row>
                <Row label="Übersetzungsfehler" desc="Sofortige Meldung bei fehlgeschlagenen Feldern">
                  <SettingsToggle label="Benachrichtigung: Übersetzungsfehler" disabled={loading}
                    enabled={settings.notifyError} onChange={v => persist("notifyError", v)} />
                </Row>
              </div>
              <p className="px-6 py-3 border-t border-[#EEF1F4] text-[12px] text-[#8A93A0]">
                Gekennzeichnete Schalter werden sofort gespeichert – es gibt keinen separaten Speichern-Schritt.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#EEF1F4] flex-wrap">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#232830] flex items-center gap-2 flex-wrap">
                    Zusammenfassungs-Digest <NotStored />
                  </h2>
                  <p className="text-[13px] text-[#5A6472] mt-0.5">Periodische E-Mail mit allen Aktivitäten der Plattform</p>
                </div>
                <SettingsToggle label="Zusammenfassungs-Digest" enabled={notifyDigest} onChange={setNotifyDigest} />
              </div>
              <div className={`px-6 py-4 flex items-center justify-between gap-4 flex-wrap ${!notifyDigest ? "opacity-40 pointer-events-none" : ""}`}>
                <div>
                  <div className="text-[14px] font-medium text-[#232830]">Häufigkeit</div>
                  <div className="text-[12px] text-[#5A6472] mt-0.5">Wird montags um 08:00 Uhr versendet</div>
                </div>
                <SettingsSelect label="Digest-Häufigkeit" value={digestFreq}
                  options={["Täglich", "Wöchentlich", "Monatlich"]} onChange={setDigestFreq} />
              </div>
            </div>
          </>}

          {/* ── Sicherheit ── */}
          {activeTab === "security" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Anmeldesicherheit" description="Einstellungen zur Absicherung aller Benutzerkonten" />
              <div className="divide-y divide-[#EEF1F4]">
                <Row label="Zwei-Faktor-Authentifizierung (MFA)" notStored
                  desc="Wird zentral im Identity-Provider (SSO) durchgesetzt, nicht in dieser Oberfläche">
                  <SettingsToggle label="Zwei-Faktor-Authentifizierung erzwingen"
                    enabled={mfaRequired} onChange={setMfaRequired} />
                </Row>
                <Row label="Einzelne aktive Sitzung" notStored
                  desc="Alte Sitzungen werden bei Neuanmeldung automatisch beendet">
                  <SettingsToggle label="Nur eine aktive Sitzung erlauben"
                    enabled={sessionSingle} onChange={setSessionSingle} />
                </Row>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Aktivitätsprotokoll" description="Sicherheitsrelevante Ereignisse der letzten 30 Tage" />
              <div className="divide-y divide-[#EEF1F4]">
                {auditLog.map((entry, i) => {
                  const typeColor: Record<string, { dot: string; bg: string; label: string }> = {
                    security: { dot: "#B42318", bg: "#FDEEEC", label: "Sicherheit" },
                    content:  { dot: "#15803D", bg: "#EAF8F0", label: "Inhalt" },
                    admin:    { dot: "#1D5BD6", bg: "#EBF1FE", label: "Verwaltung" },
                  };
                  const style = typeColor[entry.type] ?? { dot: "#8A93A0", bg: "#EEF1F4", label: entry.type };
                  return (
                    <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-[#F6F8FA] transition-colors">
                      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: style.bg }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: style.dot }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#232830] truncate">{entry.action}</div>
                        <div className="text-[11px] text-[#8A93A0] mt-0.5">{entry.user} · {style.label}</div>
                      </div>
                      <div className="text-[12px] text-[#8A93A0] tabular-nums shrink-0">{entry.ts}</div>
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-3 border-t border-[#EEF1F4]">
                <button type="button" onClick={exportAuditCsv}
                  className={`flex items-center gap-1.5 text-[13px] font-medium text-[#007D78] hover:underline rounded ${FOCUS}`}>
                  <Download size={14} />Angezeigte Einträge exportieren (CSV)
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#B42318]/25 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-[#FDEEEC] border-b border-[#B42318]/15">
                <AlertTriangle size={15} className="text-[#B42318]" />
                <span className="text-[13px] font-semibold text-[#B42318]">Gefahrenzone</span>
              </div>
              <div className="bg-white p-5 space-y-3">
                <p className="text-[13px] text-[#5A6472]">
                  Diese Aktionen sind unwiderruflich und betreffen alle aktiven Benutzer. Sie erfordern serverseitige
                  Admin-Rechte und sind in dieser Oberfläche noch nicht angebunden.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <button type="button" onClick={() => toast("Noch nicht angebunden – erfordert die Admin-API des Servers.")}
                    className={`px-4 py-2 rounded-lg border border-[#B42318] text-[13px] font-semibold text-[#B42318] hover:bg-[#B42318] hover:text-white transition-all ${FOCUS}`}>
                    Alle Sitzungen beenden
                  </button>
                  <button type="button" onClick={() => toast("Noch nicht angebunden – erfordert die Admin-API des Servers.")}
                    className={`px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#5A6472] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
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
