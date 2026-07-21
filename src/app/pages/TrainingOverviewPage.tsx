import { Clock } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { ProgressRing } from "../components/ProgressRing";
import { StatusBadge } from "../components/StatusBadge";
import type { Screen } from "../data/demo";

// ─── Training Overview ────────────────────────────────────────────────────────

export function TrainingOverview({ onNavigate }: { onNavigate: (s: Screen) => void }) {
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
