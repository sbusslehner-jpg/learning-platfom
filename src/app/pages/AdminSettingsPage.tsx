import { useState } from "react";
import {
  AlertCircle, AlertTriangle, Bell, CheckCircle2, Lock, Plus,
  RefreshCw, Settings, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "../components/Breadcrumb";

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

export function AdminSettings() {
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
