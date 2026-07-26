import { useState } from "react";
import { BookOpen, Clock } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { ProgressRing } from "../components/ProgressRing";
import { StatusBadge } from "../components/StatusBadge";
import type { Screen } from "../data/demo";
import { fetchModuleTrainings, useSupabaseData } from "../data/api";
import { useT } from "../i18n";

// ─── Training Overview ────────────────────────────────────────────────────────

const FALLBACK_TRAININGS = [
  { title: "DSR – Konfiguration im Einzelhandel", duration: "51 Min.", progress: 62, isNew: false },
  { title: "DSR – Rollenzuweisung und Berechtigungen", duration: "32 Min.", progress: 100, isNew: false },
  { title: "DSR – DealerData-Synchronisation", duration: "28 Min.", progress: 0, isNew: true },
  { title: "DSR – Fehlerbehandlung & Logs", duration: "24 Min.", progress: 0, isNew: false },
  { title: "DSR – Mobilgeräteverwaltung", duration: "19 Min.", progress: 0, isNew: true },
  { title: "DSR – API-Integration & Webhooks", duration: "38 Min.", progress: 0, isNew: false },
];

type FilterId = "all" | "started" | "new";

export function TrainingOverview({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const trainings = useSupabaseData(() => fetchModuleTrainings("dsr"), FALLBACK_TRAININGS);
  const { t } = useT();
  const [filter, setFilter] = useState<FilterId>("all");

  // "Begonnen" bleibt deutsch: für diesen Filter existiert kein UI-Schlüssel.
  const FILTERS: { id: FilterId; label: string }[] = [
    { id: "all", label: t("common.all") },
    { id: "started", label: "Begonnen" },
    { id: "new", label: t("learn.new") },
  ];

  const visible = trainings.filter(x =>
    filter === "started" ? x.progress > 0 && x.progress < 100
      : filter === "new" ? x.isNew
      : true,
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["ServiceQ", t("nav.catalog"), "Digital Service Reception"]} />
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold text-[#5A6472] tracking-widest uppercase mb-1">DSR</div>
          <h1 className="text-[26px] font-semibold text-[#232830]">Digital Service Reception</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1] ${filter === f.id ? "bg-[#E6FAF9] border-[#00C8C1] text-[#007D78]" : "bg-white border-[#C3C9D1] text-[#5A6472] hover:border-[#8A93A0]"}`}>{f.label}</button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("learn.noTrainings")} body={t("learn.noTrainingsBody")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(x => (
            <button key={x.title} onClick={() => onNavigate("learning")}
              className="text-left bg-white rounded-lg border border-[#C3C9D1] p-4 hover:border-[#00C8C1] hover:shadow-sm transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    {x.isNew && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EBF1FE] text-[#1D5BD6]">{t("learn.new")}</span>}
                    {x.progress === 100 && <StatusBadge status="published" compact />}
                  </div>
                  <p className="text-[14px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors leading-snug line-clamp-2">{x.title}</p>
                  <div className="flex items-center gap-1 mt-2 text-[12px] text-[#5A6472]"><Clock size={11} aria-hidden />{x.duration}</div>
                </div>
                <div className="relative shrink-0">
                  <ProgressRing percent={x.progress} size={40} stroke={3} />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#3A424E]">{x.progress}%</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-[#EEF1F4]">
                <span className="text-[12px] text-[#007D78] font-medium group-hover:underline">
                  {x.progress > 0 && x.progress < 100 ? t("learn.continue") : x.progress === 100 ? t("learn.repeat") : t("learn.start")} →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
