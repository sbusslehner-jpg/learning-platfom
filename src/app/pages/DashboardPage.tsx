import { ArrowRight, Clock } from "lucide-react";
import { ProgressRing } from "../components/ProgressRing";
import type { Screen } from "../data/demo";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
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
