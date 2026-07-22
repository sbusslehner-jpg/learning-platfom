import { useState } from "react";
import { AlertTriangle, Filter, Languages } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import {
  fetchTranslationOverview,
  useSupabaseData,
  type LangHealth,
  type TrainingHealth,
} from "../data/api";
import type { NavHandler } from "../data/demo";

// ─── Translations Overview ────────────────────────────────────────────────────
// Aggregat je Training × Sprache aus Supabase. Ist Supabase nicht konfiguriert
// oder liefert nichts, bleibt die eingebaute Demo-Übersicht sichtbar.

const FALLBACK_OVERVIEW: TrainingHealth[] = [
  {
    id: "demo-dsr-konfiguration",
    title: "DSR – Konfiguration im Einzelhandel",
    module: "DSR",
    urgent: 3,
    languages: [
      { code: "fr", name: "Französisch", total: 45, current: 42, outdated: 2, errors: 1, missing: 0 },
      { code: "es", name: "Spanisch", total: 45, current: 45, outdated: 0, errors: 0, missing: 0 },
      { code: "pl", name: "Polnisch", total: 45, current: 38, outdated: 5, errors: 2, missing: 0 },
      { code: "it", name: "Italienisch", total: 45, current: 44, outdated: 1, errors: 0, missing: 0 },
    ],
  },
  {
    id: "demo-ccd-grundkonfiguration",
    title: "CCD – Grundkonfiguration",
    module: "CCD",
    urgent: 2,
    languages: [
      { code: "fr", name: "Französisch", total: 30, current: 30, outdated: 0, errors: 0, missing: 0 },
      { code: "nl", name: "Niederländisch", total: 30, current: 24, outdated: 3, errors: 0, missing: 3 },
      { code: "hu", name: "Ungarisch", total: 30, current: 20, outdated: 6, errors: 4, missing: 0 },
    ],
  },
];

const langNeedsWork = (l: LangHealth) => l.outdated > 0 || l.errors > 0 || l.missing > 0;

export function TranslationsOverview({ onNavigate }: { onNavigate: NavHandler }) {
  const overview = useSupabaseData(fetchTranslationOverview, FALLBACK_OVERVIEW);
  const [onlyUrgent, setOnlyUrgent] = useState(false);

  // Untertitel immer aus den vollständigen Daten berechnen.
  const trainingCount = overview.length;
  const langCount = new Set(overview.flatMap(t => t.languages.map(l => l.code))).size;

  // Filter „Nur Handlungsbedarf": nur Sprachzeilen (und Trainings) mit Bedarf.
  const shown = onlyUrgent
    ? overview
        .map(t => ({ ...t, languages: t.languages.filter(langNeedsWork) }))
        .filter(t => t.languages.length > 0)
    : overview;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <Breadcrumb items={["Redaktion", "Übersetzungen"]} />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-semibold text-[#232830]">Übersetzungen</h1>
            <p className="text-[14px] text-[#5A6472] mt-1">{trainingCount} Trainings · {langCount} Sprachen</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOnlyUrgent(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] transition-colors ${
                onlyUrgent
                  ? "border-[#00C8C1] bg-[#E6FAF9] text-[#007D78]"
                  : "border-[#C3C9D1] text-[#3A424E] hover:bg-[#EEF1F4]"
              }`}
            >
              <Filter size={14} /> Nur Handlungsbedarf
            </button>
          </div>
        </div>

        {/* Training list */}
        <div className="space-y-3 mb-8">
          {shown.length === 0 && (
            <div className="bg-white rounded-xl border border-[#C3C9D1]">
              <EmptyState
                icon={Languages}
                title="Alles aktuell"
                body="Alle Übersetzungen sind auf dem neuesten Stand. Sobald Inhalte geändert werden, erscheinen betroffene Felder hier."
              />
            </div>
          )}
          {shown.map(t => (
            <div key={t.id} className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EEF1F4]">
                <div className="flex-1">
                  <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider mb-0.5">ServiceQ · {t.module}</div>
                  <h3 className="text-[15px] font-semibold text-[#232830]">{t.title}</h3>
                </div>
                {t.urgent > 0 && (
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#FDF3E4] text-[#B45309]">
                    <AlertTriangle size={12} /> {t.urgent} Sprachen mit Bedarf
                  </span>
                )}
              </div>
              <div className="divide-y divide-[#EEF1F4]">
                {t.languages.map(l => {
                  const clean = l.outdated === 0 && l.errors === 0 && l.missing === 0;
                  return (
                    <div key={l.code} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F6F8FA] transition-colors">
                      <div className="w-8 text-[12px] font-bold text-[#5A6472]">{l.code.toUpperCase()}</div>
                      <div className="w-24 text-[13px] text-[#3A424E]">{l.name}</div>
                      <div className="flex-1">
                        <ProgressBar percent={l.total > 0 ? Math.round((l.current / l.total) * 100) : 0} />
                      </div>
                      <div className="text-[13px] text-[#5A6472] w-24 text-right">{l.current}/{l.total} aktuell</div>
                      <div className="flex gap-1.5 flex-wrap justify-end w-32">
                        {l.outdated > 0 && <StatusBadge status="outdated" compact />}
                        {l.errors > 0 && <StatusBadge status="error" compact />}
                        {l.missing > 0 && <StatusBadge status="missing" compact />}
                        {clean && <StatusBadge status="published" compact />}
                      </div>
                      <button onClick={() => onNavigate("translations-review", `${t.id}/${l.code}`)}
                        className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-[#C3C9D1] text-[#3A424E] hover:border-[#00C8C1] hover:text-[#007D78] transition-all whitespace-nowrap">
                        Prüfen
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
