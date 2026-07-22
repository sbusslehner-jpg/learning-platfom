import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { ChevronLeft, Languages, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import {
  fetchReviewFields,
  saveCorrection,
  triggerTranslation,
  type ReviewData,
  type ReviewField,
} from "../data/api";
import { REVIEW_FIELDS, STATUS, type NavHandler, type Status } from "../data/demo";

// ─── Translation Review ───────────────────────────────────────────────────────
// Liest trainingId + Sprache aus der Route und lädt die Prüfdaten aus Supabase.
// Ohne Supabase (oder ohne Treffer) bleibt die eingebaute Demo-Ansicht sichtbar.

type Filter = "all" | "outdated" | "error";

/** Editierbares Feld für die Prüfansicht (Master ↔ Übersetzung). */
type UiField = {
  key: string;
  refType: string;
  refId: string;
  field: string;
  label: string;
  master: string;
  translation: string;
  status: Status;
  editValue: string;
};

const fromReviewField = (f: ReviewField): UiField => ({
  key: f.key,
  refType: f.refType,
  refId: f.refId,
  field: f.field,
  label: f.label,
  master: f.master,
  translation: f.translation,
  status: f.status as Status,
  editValue: f.translation,
});

export function TranslationReview({ onNavigate }: { onNavigate: NavHandler }) {
  const { trainingId, lang } = useParams();

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!trainingId || !lang || !supabase) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchReviewFields(trainingId, lang)
      .then(d => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [trainingId, lang]);

  // Kein Ziel gewählt → sanfter Leerzustand.
  if (!trainingId || !lang) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-[#C3C9D1] max-w-md w-full">
          <EmptyState
            icon={Languages}
            title="Kein Training gewählt"
            body="Wählen Sie in der Übersicht ein Training und eine Sprache, um die Übersetzungen zu prüfen."
            action="Zur Übersicht"
            onAction={() => onNavigate("translations-overview")}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[14px] text-[#5A6472]">
        Lädt …
      </div>
    );
  }

  // Echte Daten vorhanden → Live-Ansicht, sonst Demo-Ansicht.
  if (data) {
    return <LiveReview data={data} lang={lang} trainingId={trainingId} onNavigate={onNavigate} />;
  }
  return <DemoReview onNavigate={onNavigate} />;
}

// ─── Live-Ansicht (Supabase) ──────────────────────────────────────────────────

function LiveReview({
  data,
  lang,
  trainingId,
  onNavigate,
}: {
  data: ReviewData;
  lang: string;
  trainingId: string;
  onNavigate: NavHandler;
}) {
  const [fields, setFields] = useState<UiField[]>(() => data.fields.map(fromReviewField));
  const initialActive = useMemo(() => {
    const f = data.fields.find(x => x.status === "outdated" || x.status === "error") ?? data.fields[0];
    return f?.key ?? "";
  }, [data]);
  const [activeKey, setActiveKey] = useState(initialActive);
  const [filter, setFilter] = useState<Filter>("all");
  const [retranslating, setRetranslating] = useState(false);

  const saveField = async (f: UiField) => {
    const ok = await saveCorrection(f.refType, f.refId, f.field, lang, f.master, f.editValue);
    if (!ok) {
      toast.error("Speichern fehlgeschlagen");
      return;
    }
    const idx = fields.findIndex(x => x.key === f.key);
    const next = fields.slice(idx + 1).find(x => x.status === "outdated" || x.status === "error");
    setFields(prev => prev.map(x => (x.key === f.key ? { ...x, status: "corrected", translation: f.editValue } : x)));
    toast.success("Übersetzung gespeichert & gesperrt");
    if (next) setActiveKey(next.key);
  };

  const retranslate = async () => {
    if (retranslating) return;
    setRetranslating(true);
    const res = await triggerTranslation(trainingId, [lang]);
    setRetranslating(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.info(res.message);
    // Nach erfolgreichem Lauf neu laden.
    const fresh = await fetchReviewFields(trainingId, lang);
    if (fresh) setFields(fresh.fields.map(fromReviewField));
  };

  return (
    <ReviewLayout
      trainingTitle={data.trainingTitle}
      languageName={data.languageName}
      langCode={lang}
      fields={fields}
      setFields={setFields}
      activeKey={activeKey}
      setActiveKey={setActiveKey}
      filter={filter}
      setFilter={setFilter}
      onSave={saveField}
      onRetranslate={retranslate}
      retranslating={retranslating}
      onBack={() => onNavigate("translations-overview")}
    />
  );
}

// ─── Demo-Ansicht (ohne Supabase) ─────────────────────────────────────────────

function DemoReview({ onNavigate }: { onNavigate: NavHandler }) {
  const [fields, setFields] = useState<UiField[]>(() =>
    REVIEW_FIELDS.map(f => ({
      key: String(f.id),
      refType: "",
      refId: "",
      field: "",
      label: f.label,
      master: f.master,
      translation: f.translation,
      status: f.status,
      editValue: f.translation,
    })),
  );
  const [activeKey, setActiveKey] = useState("2");
  const [filter, setFilter] = useState<Filter>("all");

  const saveField = async (f: UiField) => {
    const idx = fields.findIndex(x => x.key === f.key);
    const next = fields.slice(idx + 1).find(x => x.status === "outdated" || x.status === "error");
    setFields(prev => prev.map(x => (x.key === f.key ? { ...x, status: "corrected", translation: f.editValue } : x)));
    toast.success("Übersetzung gespeichert & gesperrt");
    if (next) setActiveKey(next.key);
  };

  return (
    <ReviewLayout
      trainingTitle="DSR – Konfiguration im Einzelhandel"
      languageName="Französisch"
      langCode="fr"
      demo
      fields={fields}
      setFields={setFields}
      activeKey={activeKey}
      setActiveKey={setActiveKey}
      filter={filter}
      setFilter={setFilter}
      onSave={saveField}
      onRetranslate={async () => toast.info("Wird neu übersetzt …")}
      retranslating={false}
      onBack={() => onNavigate("translations-overview")}
    />
  );
}

// ─── Gemeinsame Darstellung ───────────────────────────────────────────────────

function ReviewLayout({
  trainingTitle,
  languageName,
  langCode,
  fields,
  setFields,
  activeKey,
  setActiveKey,
  filter,
  setFilter,
  onSave,
  onRetranslate,
  retranslating,
  onBack,
  demo = false,
}: {
  trainingTitle: string;
  languageName: string;
  langCode: string;
  fields: UiField[];
  setFields: React.Dispatch<React.SetStateAction<UiField[]>>;
  activeKey: string;
  setActiveKey: (k: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  onSave: (f: UiField) => void;
  onRetranslate: () => void;
  retranslating: boolean;
  onBack: () => void;
  demo?: boolean;
}) {
  const code = langCode.toUpperCase();
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
            <button key={f.key} onClick={() => setActiveKey(f.key)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors relative ${activeKey === f.key ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
              {activeKey === f.key && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
              <span style={{ color: STATUS[f.status].color, display: "flex" }}>{STATUS[f.status].icon}</span>
              <span className={`text-[12px] truncate ${activeKey === f.key ? "text-[#007D78] font-semibold" : "text-[#3A424E]"}`}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 shrink-0">
          <button onClick={onBack} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4]"><ChevronLeft size={18} /></button>
          <div className="flex-1">
            <p className="text-[12px] text-[#5A6472]">{trainingTitle}</p>
            <p className="text-[14px] font-semibold text-[#232830]">{languageName} ({code})</p>
          </div>
          {demo && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#EEF1F4] text-[#5A6472]">Demo-Ansicht</span>
          )}
          <div className="flex items-center gap-2 text-[13px] text-[#5A6472]">
            <span className="font-semibold text-[#007D78]">{currentCount}</span>/{fields.length} aktuell
          </div>
        </div>

        {/* Side-by-side */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 max-w-[900px]">
            <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider">Master (Deutsch)</div>
            <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider">{languageName} ({code})</div>
          </div>
          <div className="max-w-[900px] space-y-4 mt-3">
            {visible.map(f => {
              const active = activeKey === f.key;
              return (
                <div key={f.key} onClick={() => setActiveKey(f.key)}
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
                          onChange={e => setFields(prev => prev.map(fi => fi.key === f.key ? { ...fi, editValue: e.target.value } : fi))}
                          onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                              e.preventDefault();
                              onSave(f);
                            }
                          }}
                          className="w-full rounded-lg border border-[#8A93A0] px-3 py-2.5 text-[14px] text-[#232830] resize-none leading-relaxed outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button onClick={e => { e.stopPropagation(); onSave(f); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                            <Lock size={12} /> Korrigieren &amp; sperren
                          </button>
                          <button onClick={e => { e.stopPropagation(); onRetranslate(); }} disabled={retranslating}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[#C3C9D1] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors disabled:opacity-60">
                            <RefreshCw size={12} className={retranslating ? "animate-spin" : ""} /> Neu übersetzen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-[14px] leading-relaxed p-3 rounded ${f.status === "corrected" ? "bg-[#EAF8F0] text-[#15803D]" : f.status === "error" ? "bg-[#FDEEEC] text-[#B42318] italic" : "bg-[#F6F8FA] text-[#3A424E]"}`}>
                        {f.translation || <em className="text-[#B42318]">Übersetzung fehlt – Klicken zum Bearbeiten</em>}
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
