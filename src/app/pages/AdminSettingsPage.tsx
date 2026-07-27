import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, Check, CheckCircle2, Info, Lock, Mail, Plus,
  RefreshCw, Settings, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "../components/Breadcrumb";
import { fetchAppSettings, saveAppSetting } from "../data/api";
import {
  fetchSmtpSettings, saveSmtpSettings, SMTP_AVAILABLE, testSmtpSettings,
  type SmtpInput,
} from "../data/smtpApi";
import { ROLE_LABELS, type Role } from "../data/roles";
import { UI_LANGUAGES, useT } from "../i18n";

// ─── Admin: Settings ──────────────────────────────────────────────────────────
// Alle Schalter mit hinterlegtem Schlüssel schreiben sofort in `app_setting`
// (optimistisch, Rücknahme bei Fehler). Nicht angebundene Funktionen werden
// ausschließlich als Hinweis gezeigt und besitzen keine wirkungslosen Regler.
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

// ─── Mail-Einstellungen (SMTP) ───────────────────────────────────────────────
// Schreibt NICHT in `app_setting`, sondern über /api/admin/smtp in den
// Keycloak-Realm: Von dort gehen die Einladungen raus, dort muss die
// Einstellung also liegen. Das Passwort wird nie zurückgelesen – ein leeres
// Feld bedeutet „bestehendes behalten", nicht „löschen".

const INPUT_CLASS =
  `w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] ` +
  `placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 ` +
  `focus:ring-[#009D97]/20 transition-all ${FOCUS}`;

function Field({ id, label, hint, children }: {
  id: string; label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-[#3A424E] mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#8A93A0]">{hint}</p>}
    </div>
  );
}

function SmtpPanel() {
  const [form, setForm] = useState<SmtpInput>({
    host: "", port: "587", from: "", fromDisplayName: "GroupIT Lernplattform",
    replyTo: "", encryption: "starttls", auth: true, user: "", password: "",
  });
  const [passwordSet, setPasswordSet] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "test">(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchSmtpSettings().then(s => {
      if (!alive) return;
      if (s) {
        setForm({
          host: s.host, port: s.port, from: s.from, fromDisplayName: s.fromDisplayName,
          replyTo: s.replyTo, encryption: s.encryption, auth: s.auth, user: s.user, password: "",
        });
        setPasswordSet(s.passwordSet);
        setConfigured(s.configured);
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof SmtpInput>(key: K, value: SmtpInput[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const run = async (what: "save" | "test") => {
    setBusy(what);
    setErrors([]);
    const result = what === "save" ? await saveSmtpSettings(form) : await testSmtpSettings(form);
    setBusy(null);
    if (result.ok) {
      toast.success(result.message);
      if (what === "save" && form.password) { setPasswordSet(true); set("password", ""); }
      if (what === "save") setConfigured(true);
    } else {
      setErrors(result.fieldErrors ?? [result.message]);
      toast.error(result.message);
    }
  };

  if (!SMTP_AVAILABLE) {
    return (
      <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
        <SectionHeader title="E-Mail-Versand" description="Nur im Keycloak-Modus verfügbar" />
        <div className="px-6 py-5 text-[13px] text-[#5A6472]">
          Diese Einstellung schreibt in den Keycloak-Realm. Ohne konfigurierte
          Keycloak-Anbindung gibt es dort nichts zu schreiben.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
      <SectionHeader
        title="E-Mail-Versand (SMTP)"
        description="Über diesen Server verschickt die Plattform Einladungen und Links zum Zurücksetzen von Passwörtern"
      />

      {!loading && !configured && (
        <div className="mx-6 mt-5 flex gap-2.5 rounded-lg bg-[#FDF3E4] border border-[#F5E3C6] px-4 py-3">
          <AlertTriangle size={16} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] text-[#B45309]">
            Noch kein Mailserver hinterlegt. Eingeladene Benutzer erhalten deshalb
            keine Nachricht und können ihr Passwort nicht setzen. Das Konto wird
            trotzdem angelegt; die Einladung lässt sich später erneut versenden.
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mx-6 mt-5 rounded-lg bg-[#FDEEEC] border border-[#F5C6C2] px-4 py-3">
          <ul className="text-[12px] text-[#B42318] space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="px-6 py-5 grid gap-4 sm:grid-cols-2">
        <Field id="smtp-host" label="Server">
          <input id="smtp-host" className={INPUT_CLASS} value={form.host} disabled={loading}
            placeholder="smtp-relay.brevo.com"
            onChange={e => set("host", e.target.value)} />
        </Field>
        <Field id="smtp-port" label="Port" hint="587 mit STARTTLS, 465 mit SSL">
          <input id="smtp-port" className={INPUT_CLASS} value={form.port} disabled={loading}
            inputMode="numeric" onChange={e => set("port", e.target.value)} />
        </Field>
        <Field id="smtp-from" label="Absenderadresse">
          <input id="smtp-from" type="email" className={INPUT_CLASS} value={form.from} disabled={loading}
            placeholder="noreply@deine-domain.de"
            onChange={e => set("from", e.target.value)} />
        </Field>
        <Field id="smtp-fromname" label="Anzeigename des Absenders">
          <input id="smtp-fromname" className={INPUT_CLASS} value={form.fromDisplayName} disabled={loading}
            onChange={e => set("fromDisplayName", e.target.value)} />
        </Field>
        <Field id="smtp-replyto" label="Antwortadresse" hint="Leer lassen, um die Absenderadresse zu verwenden">
          <input id="smtp-replyto" type="email" className={INPUT_CLASS} value={form.replyTo} disabled={loading}
            onChange={e => set("replyTo", e.target.value)} />
        </Field>
        <Field id="smtp-enc" label="Verschlüsselung">
          <select id="smtp-enc" className={INPUT_CLASS} value={form.encryption} disabled={loading}
            onChange={e => set("encryption", e.target.value as SmtpInput["encryption"])}>
            <option value="starttls">STARTTLS (empfohlen)</option>
            <option value="ssl">SSL/TLS</option>
            <option value="none">Keine</option>
          </select>
        </Field>
      </div>

      <div className="px-6 pb-5 border-t border-[#EEF1F4] pt-5">
        <label className="flex items-center gap-2 text-[13px] text-[#3A424E] mb-4 cursor-pointer">
          <input type="checkbox" className="accent-[#00C8C1]" checked={form.auth} disabled={loading}
            onChange={e => set("auth", e.target.checked)} />
          Anmeldung am Mailserver erforderlich
        </label>

        {form.auth && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="smtp-user" label="Benutzername">
              <input id="smtp-user" className={INPUT_CLASS} value={form.user} disabled={loading}
                autoComplete="off" onChange={e => set("user", e.target.value)} />
            </Field>
            <Field id="smtp-pass" label="Passwort"
              hint={passwordSet ? "Hinterlegt. Leer lassen, um es unverändert zu übernehmen." : "Noch keines hinterlegt."}>
              <input id="smtp-pass" type="password" className={INPUT_CLASS} value={form.password ?? ""}
                disabled={loading} autoComplete="new-password"
                placeholder={passwordSet ? "••••••••" : ""}
                onChange={e => set("password", e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-[#EEF1F4] flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => run("save")} disabled={loading || busy !== null}
          className={`h-10 px-4 rounded-lg bg-[#00C8C1] text-white text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 transition-colors ${FOCUS}`}>
          {busy === "save" ? "Wird gespeichert …" : "Speichern"}
        </button>
        <button type="button" onClick={() => run("test")} disabled={loading || busy !== null}
          className={`h-10 px-4 rounded-lg border border-[#8A93A0] text-[#3A424E] text-[13px] font-semibold hover:bg-[#F6F8FA] disabled:opacity-50 transition-colors ${FOCUS}`}>
          {busy === "test" ? "Wird gesendet …" : "Verbindung testen"}
        </button>
        <p className="text-[11px] text-[#8A93A0]">
          Der Test schickt eine Nachricht an die E-Mail-Adresse Ihres eigenen Kontos.
        </p>
      </div>
    </div>
  );
}

function Row({ label, desc, children }: {
  label: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="text-[14px] font-medium text-[#232830] flex items-center gap-2 flex-wrap">
          {label}
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
  type SettingsTab = "api" | "smtp" | "platform" | "notifications" | "security";
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  // Persistierte Einstellungen
  const [settings, setSettings] = useState<Persisted>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(false);

  // Nur UI-Zustand
  const [keyPanel, setKeyPanel] = useState(false);
  const glossaryTerms = [
    "ServiceQ", "DSR", "RPD", "RPC", "CCD", "CCC", "Dealer_Admin",
    "DealerData", "Online Check-In", "GroupIT", "CDM", "DMS",
  ];

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

  const NAV: { id: SettingsTab; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: "api",           label: "Mistral AI",         icon: Sparkles, badge: settings.autoOnPublish ? "Auto" : undefined },
    { id: "smtp",          label: "E-Mail (SMTP)",      icon: Mail },
    { id: "platform",      label: "Plattform",          icon: Settings },
    { id: "notifications", label: "Benachrichtigungen",  icon: Bell },
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
              <div className="px-5 py-4">
                <div className="text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide mb-1">Konfiguriertes Modell</div>
                <div className="text-[14px] font-semibold text-[#232830]">{settings.model}</div>
              </div>
              <p className="px-5 pb-4 text-[12px] text-[#8A93A0]">
                Nutzungs- und Kostenmetriken sind noch nicht angebunden. Es werden bewusst keine Schätz- oder Demo-Werte angezeigt.
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
                        <th scope="col" className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Begriff</th>
                        <th scope="col" className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#8A93A0] uppercase tracking-wide">Verhalten</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF1F4]">
                      {glossaryTerms.map(term => (
                        <tr key={term} className="hover:bg-[#F6F8FA] transition-colors">
                          <td className="px-4 py-3 font-medium text-[#232830]">{term}</td>
                          <td className="px-4 py-3 text-[#5A6472]">Nicht übersetzen</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-[#EEF1F4]">
                  <span className="text-[11px] text-[#8A93A0]">
                    Die Liste entspricht exakt der serverseitigen Worker-Konfiguration. Änderungen erfordern derzeit ein Deployment.
                  </span>
                </div>
              </div>
            </div>
          </>}

          {/* ── Plattform ── */}
          {activeTab === "smtp" && <SmtpPanel />}

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
                <Row label="Speicherverhalten" desc="Editoränderungen werden feld- oder aktionsbezogen gespeichert; das Intervall ist nicht konfigurierbar">
                  <span className="text-[13px] font-semibold text-[#3A424E]">Automatisch</span>
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
                <Row label="Sitzungs-Timeout" desc="Automatische Abmeldung nach Inaktivität; zusätzlich gelten die zentralen Keycloak-Limits">
                  <span className="text-[13px] font-semibold text-[#3A424E]">30 Minuten</span>
                </Row>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Plattform-Info" description="Versionsinformationen und Systemkennzahlen" />
              <p className="px-6 py-4 text-[13px] text-[#5A6472]">
                Build-Metadaten sind noch nicht an die Laufzeit angebunden. Belastbare Nutzungskennzahlen stehen unter Verwaltung → Auswertungen.
              </p>
            </div>
          </>}

          {/* ── Benachrichtigungen ── */}
          {activeTab === "notifications" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="E-Mail-Benachrichtigungen" description="Automatisierte Plattformmeldungen" />
              <div className="flex items-start gap-2.5 px-6 py-4 bg-[#FDF3E4]">
                <AlertTriangle size={16} className="text-[#B45309] shrink-0 mt-0.5" />
                <p className="text-[13px] text-[#B45309] leading-snug">
                  Der Versand-Worker für Veröffentlichungs-, Übersetzungs- und Digest-Meldungen ist noch nicht implementiert.
                  Die SMTP-Konfiguration wird derzeit ausschließlich für Keycloak-Einladungs- und Kontomails verwendet.
                </p>
              </div>
            </div>
          </>}

          {/* ── Sicherheit ── */}
          {activeTab === "security" && <>
            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Anmeldesicherheit" description="Wird verbindlich im Identity-Provider konfiguriert" />
              <p className="px-6 py-4 text-[13px] text-[#5A6472]">
                MFA, Passwortregeln, Brute-Force-Schutz und Sitzungsrichtlinien werden ausschließlich im Keycloak-Realm verwaltet.
                Diese Oberfläche zeigt dafür bewusst keine wirkungslosen Schalter.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
              <SectionHeader title="Aktivitätsprotokoll" description="Sicherheitsrelevante Ereignisse" />
              <p className="px-6 py-4 text-[13px] text-[#5A6472]">
                Ein zentrales, manipulationsgeschütztes Audit-Log ist noch nicht angebunden. Es werden keine erfundenen Ereignisse angezeigt.
              </p>
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
              </div>
            </div>
          </>}

        </div>{/* right content */}
      </div>{/* two-column */}
    </div>
  );
}
