import { BookMarked } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { ProgressBar } from "../components/ProgressBar";
import type { Screen } from "../data/demo";
import { fetchCatalogModules, useSupabaseData } from "../data/api";
import { useT } from "../i18n";

// ─── Catalog ─────────────────────────────────────────────────────────────────

const FALLBACK_MODULES = [
  { name: "Digital Service Reception", code: "DSR", count: 6, done: 3 },
  { name: "Remote Prognose & Diagnose", code: "RPD", count: 4, done: 0 },
  { name: "Connected Car Diagnostics", code: "CCD", count: 5, done: 0 },
  { name: "Onboarding & Systemüberblick", code: "OB", count: 3, done: 3 },
];

export function Catalog({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const modules = useSupabaseData(fetchCatalogModules, FALLBACK_MODULES);
  const { t } = useT();
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["ServiceQ", t("nav.catalog")]} />
      <h1 className="text-[28px] font-semibold text-[#232830] mb-2">{t("learn.catalogTitle")}</h1>
      <p className="text-[15px] text-[#5A6472] mb-8">{t("learn.catalogSubtitle")}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map(m => (
          <button key={m.code} onClick={() => onNavigate("training-overview")}
            className="text-left bg-white rounded-xl border border-[#C3C9D1] p-6 hover:border-[#00C8C1] hover:shadow-md transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-[11px] font-bold text-[#5A6472] tracking-widest uppercase mb-1">{m.code}</div>
                <h2 className="text-[18px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors leading-tight">{m.name}</h2>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#E6FAF9] flex items-center justify-center shrink-0">
                <BookMarked size={22} style={{ color: "#00C8C1" }} aria-hidden />
              </div>
            </div>
            <div className="flex items-center justify-between text-[13px] text-[#5A6472] mb-3">
              <span>{m.count} {t("learn.trainings")}</span>
              <span>{m.done}/{m.count} {t("learn.completed")}</span>
            </div>
            <ProgressBar percent={m.count ? Math.round((m.done / m.count) * 100) : 0} />
          </button>
        ))}
      </div>
    </div>
  );
}
