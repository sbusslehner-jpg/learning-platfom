import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Check, Languages, Map as MapIcon, PencilLine, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { useT } from "../i18n";
import { DEMO_MODE } from "../data/runtime";
import {
  createMarket, deleteMarket, fetchAdminMarkets, fetchLanguages,
  updateMarketLanguages, updateMarketName,
  type AdminMarket,
} from "../data/api";
import { AdminLanguagesPanel } from "./AdminLanguagesPanel";

// ─── Admin: Markets & Languages ───────────────────────────────────────────────
// Echte Verwaltung über Supabase (market, market_language). Ohne verbundene
// Datenbank bleibt die eingebaute Demo-Tabelle sichtbar – dann nur lesend.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";

const DEMO_MARKETS: AdminMarket[] = [
  { id: "demo-de", code: "DE", name: "Deutschland", languages: ["de"], defaultLanguage: "de", trainings: 12 },
  { id: "demo-at", code: "AT", name: "Österreich",  languages: ["de"], defaultLanguage: "de", trainings: 12 },
  { id: "demo-fr", code: "FR", name: "Frankreich",  languages: ["fr", "de"], defaultLanguage: "fr", trainings: 10 },
  { id: "demo-pl", code: "PL", name: "Polen",       languages: ["pl", "de"], defaultLanguage: "pl", trainings: 8 },
  { id: "demo-es", code: "ES", name: "Spanien",     languages: ["es", "de"], defaultLanguage: "es", trainings: 9 },
  { id: "demo-hu", code: "HU", name: "Ungarn",      languages: ["hu", "de"], defaultLanguage: "hu", trainings: 6 },
];

type Lang = { code: string; name: string };
type FormState = { code: string; name: string; languages: string[]; defaultLanguage: string };
const EMPTY_FORM: FormState = { code: "", name: "", languages: [], defaultLanguage: "" };

export function AdminMarkets() {
  const { t } = useT();

  const [tab, setTab] = useState<"markets" | "languages">("markets");
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);

  // Anlegen
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<"code" | "name" | "languages" | "defaultLanguage", string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Zeilen-Editoren
  const [editNameId, setEditNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [editLangsId, setEditLangsId] = useState<string | null>(null);
  const [langDraft, setLangDraft] = useState<string[]>([]);
  const [defaultDraft, setDefaultDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    const rows = await fetchAdminMarkets();
    if (rows) {
      setMarkets(rows);
      setDemo(false);
    } else {
      setMarkets(DEMO_MODE ? DEMO_MARKETS : []);
      setDemo(DEMO_MODE);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void fetchLanguages().then(l => setLanguages(l ?? []));
  }, [load]);

  // Ohne Sprachtabelle behelfsweise die in den Märkten vorkommenden Codes.
  const langOptions: Lang[] = languages.length
    ? languages
    : [...new Set(markets.flatMap(m => m.languages))].sort().map(code => ({ code, name: code.toUpperCase() }));

  const langName = (code: string) => langOptions.find(l => l.code === code)?.name ?? code.toUpperCase();
  const langCount = new Set(markets.flatMap(m => m.languages)).size;

  const closeEditors = () => {
    setEditNameId(null);
    setEditLangsId(null);
    setConfirmId(null);
  };

  // ─── Mutationen ────────────────────────────────────────────────────────────

  const saveName = async (marketId: string) => {
    const value = nameDraft.trim();
    if (!value) { toast.error("Name ist erforderlich"); return; }
    setBusyId(marketId);
    const ok = await updateMarketName(marketId, value);
    setBusyId(null);
    if (!ok) { toast.error(t("common.dbRequired")); return; }
    toast.success("Name gespeichert");
    setEditNameId(null);
    await load(true);
  };

  const saveLanguages = async (marketId: string) => {
    if (!langDraft.length) { toast.error("Mindestens eine Sprache auswählen"); return; }
    const fallbackDefault = langDraft.includes(defaultDraft) ? defaultDraft : langDraft[0];
    setBusyId(marketId);
    const ok = await updateMarketLanguages(marketId, langDraft, fallbackDefault);
    setBusyId(null);
    if (!ok) { toast.error(t("common.dbRequired")); return; }
    toast.success("Sprachen gespeichert");
    setEditLangsId(null);
    await load(true);
  };

  const removeMarket = async (marketId: string) => {
    setBusyId(marketId);
    const res = await deleteMarket(marketId);
    setBusyId(null);
    setConfirmId(null);
    if (!res.ok) { toast.error(res.message ?? t("common.dbRequired")); return; }
    toast.success("Markt gelöscht");
    await load(true);
  };

  const submitForm = async () => {
    const next: typeof errors = {};
    const code = form.code.trim().toUpperCase();
    if (!code) next.code = "Code ist erforderlich";
    else if (!/^[A-Z]{2,3}$/.test(code)) next.code = "Code muss aus 2–3 Buchstaben bestehen";
    else if (markets.some(m => m.code.toUpperCase() === code)) next.code = "Dieser Code ist bereits vergeben";
    if (!form.name.trim()) next.name = "Name ist erforderlich";
    if (!form.languages.length) next.languages = "Mindestens eine Sprache auswählen";
    else if (!form.languages.includes(form.defaultLanguage))
      next.defaultLanguage = "Standardsprache muss eine der gewählten Sprachen sein";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    const res = await createMarket({
      code, name: form.name.trim(),
      languages: form.languages, defaultLanguage: form.defaultLanguage,
    });
    setSubmitting(false);
    if (!res.ok) { toast.error(res.message ?? t("common.saveError")); return; }
    toast.success("Markt angelegt");
    setShowForm(false);
    setForm(EMPTY_FORM);
    setErrors({});
    await load(true);
  };

  const toggleFormLanguage = (code: string) =>
    setForm(f => {
      const on = f.languages.includes(code);
      const languagesNext = on ? f.languages.filter(c => c !== code) : [...f.languages, code];
      const defaultNext = languagesNext.includes(f.defaultLanguage)
        ? f.defaultLanguage
        : (languagesNext[0] ?? "");
      return { ...f, languages: languagesNext, defaultLanguage: defaultNext };
    });

  const openForm = () => { setForm(EMPTY_FORM); setErrors({}); setShowForm(true); };

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={[t("nav.admin"), t("nav.markets")]} />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#232830]">{t("nav.markets")}</h1>
          <p className="text-[14px] text-[#5A6472] mt-1">
            {loading ? t("common.loading") : `${markets.length} aktive Märkte · ${langCount} Sprachen`}
          </p>
        </div>
        {tab === "markets" && (
          <button onClick={openForm} disabled={demo}
            title={demo ? t("common.dbRequired") : undefined}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[14px] transition-all ${FOCUS} ${demo ? "opacity-50 cursor-not-allowed" : ""}`}
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            <Plus size={16} aria-hidden="true" /> Markt anlegen
          </button>
        )}
      </div>

      {/* Märkte und Sprachstamm gehören zusammen: Ein Markt bekommt Sprachen
          zugeordnet, die es im Stamm geben muss. Zwei getrennte Seiten hätten
          den Weg dorthin unnötig lang gemacht. */}
      <div className="flex items-center gap-1 border-b border-[#E1E5EA] mb-5" role="tablist">
        {([["markets", "Märkte"], ["languages", "Sprachen"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-[14px] font-medium border-b-2 -mb-px transition-colors ${FOCUS} ${
              tab === key
                ? "border-[#00C8C1] text-[#232830]"
                : "border-transparent text-[#5A6472] hover:text-[#232830]"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "languages" && <AdminLanguagesPanel readOnly={demo} />}
      {tab === "markets" && (<>

      {demo && !loading && (
        <div className="mb-4 rounded-lg bg-[#FDF3E4] text-[#B45309] text-[12px] px-4 py-2 border border-[#F5E3C6]">
          Demo-Ansicht – mit verbundener Datenbank wird hier echt verwaltet.
        </div>
      )}

      {/* Anlegen-Formular */}
      {showForm && (
        <form onSubmit={e => { e.preventDefault(); void submitForm(); }}
          className="mb-4 bg-white rounded-lg border border-[#C3C9D1] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-[#232830]">Neuen Markt anlegen</h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label={t("common.close")}
              className={`p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] ${FOCUS}`}>
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div>
              <label htmlFor="market-code" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                Code <span aria-hidden="true">*</span>
              </label>
              <input id="market-code" value={form.code} required maxLength={3}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                aria-invalid={!!errors.code} aria-describedby={errors.code ? "err-code" : "hint-code"}
                placeholder="DE"
                className={`w-full h-10 px-3 rounded-lg border font-mono uppercase text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS} ${errors.code ? "border-[#B42318]" : "border-[#8A93A0] focus:border-[#009D97]"}`} />
              {errors.code ? (
                <p id="err-code" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                  <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.code}
                </p>
              ) : (
                <p id="hint-code" className="mt-1 text-[12px] text-[#5A6472]">2–3 Buchstaben, z. B. DE oder CHE</p>
              )}
            </div>

            <div>
              <label htmlFor="market-name" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                Name <span aria-hidden="true">*</span>
              </label>
              <input id="market-name" value={form.name} required
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                aria-invalid={!!errors.name} aria-describedby={errors.name ? "err-market-name" : undefined}
                placeholder="Deutschland"
                className={`w-full h-10 px-3 rounded-lg border text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS} ${errors.name ? "border-[#B42318]" : "border-[#8A93A0] focus:border-[#009D97]"}`} />
              {errors.name && (
                <p id="err-market-name" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                  <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.name}
                </p>
              )}
            </div>

            <fieldset>
              <legend className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                Sprachen <span aria-hidden="true">*</span>
              </legend>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-[#8A93A0] min-h-[44px]"
                aria-describedby={errors.languages ? "err-langs" : undefined}>
                {langOptions.length === 0 && (
                  <span className="text-[12px] text-[#5A6472]">{t("common.dbRequired")}</span>
                )}
                {langOptions.map(l => {
                  const on = form.languages.includes(l.code);
                  return (
                    <button key={l.code} type="button" aria-pressed={on} onClick={() => toggleFormLanguage(l.code)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border transition-colors ${FOCUS} ${
                        on
                          ? "bg-[#E6FAF9] text-[#007D78] border-[#00C8C1]"
                          : "bg-white text-[#5A6472] border-[#C3C9D1] hover:bg-[#EEF1F4]"
                      }`}>
                      {on && <Check size={11} aria-hidden="true" />}{l.code.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              {errors.languages && (
                <p id="err-langs" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                  <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.languages}
                </p>
              )}
            </fieldset>

            <div>
              <label htmlFor="market-default" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                Standardsprache <span aria-hidden="true">*</span>
              </label>
              <select id="market-default" value={form.defaultLanguage}
                onChange={e => setForm(f => ({ ...f, defaultLanguage: e.target.value }))}
                aria-invalid={!!errors.defaultLanguage}
                aria-describedby={errors.defaultLanguage ? "err-default" : undefined}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-[14px] text-[#232830] outline-none focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS} ${errors.defaultLanguage ? "border-[#B42318]" : "border-[#8A93A0] focus:border-[#009D97]"}`}>
                <option value="">Bitte wählen …</option>
                {form.languages.map(code => (
                  <option key={code} value={code}>{langName(code)}</option>
                ))}
              </select>
              {errors.defaultLanguage && (
                <p id="err-default" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                  <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.defaultLanguage}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={submitting}
              className={`px-4 py-2.5 rounded-lg font-semibold text-[14px] flex items-center gap-2 transition-all ${FOCUS} disabled:opacity-60`}
              style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
              <Plus size={16} aria-hidden="true" /> {submitting ? t("common.saving") : t("common.create")}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className={`px-4 py-2.5 rounded-lg border border-[#C3C9D1] font-medium text-[14px] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3" aria-busy="true">
            <p className="text-[13px] text-[#5A6472]">{t("common.loading")}</p>
            {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-[#EEF1F4] animate-pulse" />)}
          </div>
        ) : markets.length === 0 ? (
          <EmptyState
            icon={MapIcon}
            title="Keine Märkte angelegt"
            body="Legen Sie einen Markt an, um Trainings und Sprachen zuzuordnen."
            action="Markt anlegen"
            onAction={openForm}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[840px]">
              <thead>
                <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
                  {["Markt", "Code", "Sprachen", "Standardsprache", "Trainings"].map(h => (
                    <th key={h} scope="col" className="text-left px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">{h}</th>
                  ))}
                  <th scope="col" className="text-right px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F4]">
                {markets.map(m => (
                  <Fragment key={m.id}>
                    <tr className="hover:bg-[#F6F8FA] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#232830]">
                        {editNameId === m.id ? (
                          <div className="flex items-center gap-1.5">
                            <label htmlFor={`name-${m.id}`} className="sr-only">Name von {m.code}</label>
                            <input id={`name-${m.id}`} value={nameDraft} autoFocus
                              onChange={e => setNameDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); void saveName(m.id); }
                                if (e.key === "Escape") setEditNameId(null);
                              }}
                              className={`h-9 px-2.5 w-44 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS}`} />
                            <button onClick={() => saveName(m.id)} disabled={busyId === m.id}
                              className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${FOCUS} disabled:opacity-60`}
                              style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                              {t("common.save")}
                            </button>
                            <button onClick={() => setEditNameId(null)} aria-label={t("common.cancel")}
                              className={`p-1.5 rounded text-[#5A6472] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                              <X size={15} />
                            </button>
                          </div>
                        ) : m.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[12px] font-bold text-[#5A6472] bg-[#EEF1F4] px-1.5 py-0.5 rounded">{m.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {m.languages.length === 0 && <span className="text-[12px] text-[#8A93A0]">—</span>}
                          {m.languages.map(l => (
                            <span key={l} title={langName(l)}
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#E6FAF9] text-[#007D78]">
                              {l.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#3A424E]">
                        {m.defaultLanguage ? m.defaultLanguage.toUpperCase() : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#5A6472]">{m.trainings}</td>
                      <td className="px-4 py-3">
                        {demo ? (
                          <span className="block text-right text-[13px] text-[#8A93A0]" title={t("common.dbRequired")}>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{t("common.dbRequired")}</span>
                          </span>
                        ) : confirmId === m.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => removeMarket(m.id)} disabled={busyId === m.id}
                              className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold text-white transition-colors ${FOCUS} disabled:opacity-60`}
                              style={{ backgroundColor: "#B42318" }}>
                              Wirklich löschen?
                            </button>
                            <button onClick={() => setConfirmId(null)} aria-label={t("common.cancel")}
                              className={`p-1.5 rounded text-[#5A6472] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => { closeEditors(); setNameDraft(m.name); setEditNameId(m.id); }}
                              aria-label={`Name von ${m.name} bearbeiten`} title="Name bearbeiten"
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-colors ${FOCUS}`}>
                              <PencilLine size={15} />
                            </button>
                            <button
                              onClick={() => {
                                closeEditors();
                                setLangDraft(m.languages);
                                setDefaultDraft(m.defaultLanguage ?? m.languages[0] ?? "");
                                setEditLangsId(m.id);
                              }}
                              aria-label={`Sprachen von ${m.name} bearbeiten`} title="Sprachen bearbeiten"
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-colors ${FOCUS}`}>
                              <Languages size={15} />
                            </button>
                            <button onClick={() => { closeEditors(); setConfirmId(m.id); }}
                              aria-label={`${m.name} löschen`} title={t("common.delete")}
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#B42318] hover:bg-[#FDEEEC] transition-colors ${FOCUS}`}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {editLangsId === m.id && (
                      <tr className="bg-[#F6F8FA]">
                        <td colSpan={6} className="px-4 py-4">
                          <fieldset>
                            <legend className="text-[13px] font-semibold text-[#232830] mb-2">
                              Sprachen von {m.name} – Standardsprache mit dem Radio-Feld wählen
                            </legend>
                            {langOptions.length === 0 ? (
                              <p className="text-[13px] text-[#5A6472] mb-3">{t("common.dbRequired")}</p>
                            ) : (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {langOptions.map(l => {
                                  const on = langDraft.includes(l.code);
                                  return (
                                    <div key={l.code}
                                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12px] transition-colors ${
                                        on ? "bg-[#E6FAF9] border-[#00C8C1]" : "bg-white border-[#C3C9D1]"
                                      }`}>
                                      <label className="flex items-center gap-1.5 font-semibold text-[#3A424E]">
                                        <input type="checkbox" checked={on}
                                          onChange={e => {
                                            const next = e.target.checked
                                              ? [...langDraft, l.code]
                                              : langDraft.filter(c => c !== l.code);
                                            setLangDraft(next);
                                            if (!next.includes(defaultDraft)) setDefaultDraft(next[0] ?? "");
                                          }}
                                          className={`w-4 h-4 accent-[#00C8C1] ${FOCUS}`} />
                                        {l.code.toUpperCase()} <span className="font-normal text-[#5A6472]">{l.name}</span>
                                      </label>
                                      <label className={`flex items-center gap-1 text-[11px] ${on ? "text-[#007D78]" : "text-[#8A93A0]"}`}>
                                        <input type="radio" name={`default-${m.id}`} value={l.code} disabled={!on}
                                          checked={defaultDraft === l.code}
                                          onChange={() => setDefaultDraft(l.code)}
                                          className={`w-3.5 h-3.5 accent-[#00C8C1] ${FOCUS}`} />
                                        Standard
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveLanguages(m.id)} disabled={busyId === m.id}
                                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${FOCUS} disabled:opacity-60`}
                                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                                {busyId === m.id ? t("common.saving") : t("common.save")}
                              </button>
                              <button onClick={() => setEditLangsId(null)}
                                className={`px-3 py-1.5 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                                {t("common.cancel")}
                              </button>
                            </div>
                          </fieldset>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
