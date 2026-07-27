import { useMemo } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { ProgressRing } from "../components/ProgressRing";
import type { Screen } from "../data/demo";
import { fetchDashboardLists, useSupabaseData } from "../data/api";
import { currentProfile } from "../data/keycloakAuth";
import { DEMO_MODE } from "../data/runtime";
import { useT } from "../i18n";

// ─── Dashboard ────────────────────────────────────────────────────────────────

const FALLBACK_LISTS = {
  fresh: [
    { title: "CCD – Grundkonfiguration", module: "CCD", duration: "18 Min.", isNew: true },
    { title: "RPD – Remote Service Setup", module: "RPD", duration: "11 Min.", isNew: true },
  ],
  mine: [
    { title: "DSR – Konfiguration im Einzelhandel", module: "DSR", progress: 62, status: "begonnen" },
    { title: "DSR – Rollenzuweisung und Berechtigungen", module: "DSR", progress: 100, status: "abgeschlossen" },
    { title: "ServiceQ – Systemüberblick", module: "Onboarding", progress: 100, status: "abgeschlossen" },
    { title: "DSR – Fehlerbehandlung & Logs", module: "DSR", progress: 0, status: "offen" },
  ],
};

// Statuswerte kommen als deutsche Datenwerte aus der Datenbank; für die Anzeige
// werden sie auf i18n-Schlüssel abgebildet (Daten selbst bleiben unverändert).
const STATUS_KEYS: Record<string, string> = {
  offen: "learn.status.open",
  begonnen: "learn.status.started",
  abgeschlossen: "learn.status.done",
};

/** Anrede im Demo-Betrieb. Bei echter Anmeldung kommt der Name aus dem Token –
 *  einen angemeldeten Benutzer mit einem erfundenen Vornamen zu begrüßen, ist
 *  das Gegenteil von Vertrauen. */
const DEMO_LEARNER_NAME = "Max";

/** Vorname für die Begrüßung: aus dem Token, sonst der Demo-Platzhalter. */
function greetingName(): string {
  const name = currentProfile()?.name?.trim();
  if (!name) return DEMO_LEARNER_NAME;
  // Nur den Vornamen – "Willkommen zurück, Sebastian!" statt vollem Namen.
  return name.split(/\s+/)[0];
}

export function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { fresh, mine } = useSupabaseData(
    fetchDashboardLists,
    FALLBACK_LISTS,
    { fresh: [], mine: [] },
    DEMO_MODE,
  );
  const { t, lang } = useT();

  // Datum folgt der gewählten Oberflächensprache (kein hartcodiertes Datum).
  const today = useMemo(
    () => new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    [lang],
  );

  const statusLabel = (status: string) => (STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status);
  const continueTraining = mine.find(item => item.progress > 0 && item.progress < 100) ?? mine[0];

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <h1 className="text-[28px] font-semibold text-[#232830] mb-1">{t("learn.greeting")}, {greetingName()}!</h1>
      <p className="text-[15px] text-[#5A6472] mb-8">{today}</p>

      {/* Weiterlernen hero */}
      {continueTraining ? (
        <div className="bg-white rounded-xl border border-[#C3C9D1] p-6 mb-8 flex items-center gap-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="relative shrink-0">
            <ProgressRing percent={continueTraining.progress} size={80} stroke={5} />
            <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-[#232830]">{continueTraining.progress}%</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-[#5A6472] uppercase tracking-wider mb-1">{t("learn.lastOpened")} · ServiceQ</div>
            <h2 className="text-[20px] font-semibold text-[#232830] leading-tight mb-1">{continueTraining.title}</h2>
            <p className="text-[14px] text-[#5A6472]">{continueTraining.module}</p>
          </div>
          <button
            onClick={() => onNavigate("learning")}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[15px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}
          >
            {t("learn.continue")} <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#C3C9D1] p-6 mb-8 text-[14px] text-[#5A6472]">
          {t("learn.noTrainingsBody")}
        </div>
      )}

      {/* Two columns */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Neu für dich */}
        <div className="xl:col-span-1">
          <h2 className="text-[17px] font-semibold text-[#232830] mb-4">{t("learn.newForYou")}</h2>
          <div className="space-y-3">
            {fresh.map(item => (
              <button key={item.title} onClick={() => onNavigate("learning")}
                className="w-full text-left bg-white rounded-lg border border-[#C3C9D1] p-4 hover:border-[#00C8C1] hover:shadow-sm transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-[#5A6472] uppercase tracking-wide">ServiceQ · {item.module}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EBF1FE] text-[#1D5BD6]">{t("learn.new")}</span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors leading-snug">{item.title}</p>
                    <div className="flex items-center gap-1 mt-1.5 text-[12px] text-[#5A6472]"><Clock size={11} aria-hidden />{item.duration}</div>
                  </div>
                  <ArrowRight size={16} aria-hidden className="text-[#C3C9D1] group-hover:text-[#00C8C1] transition-colors mt-1 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Meine Trainings */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-semibold text-[#232830]">{t("learn.myTrainings")}</h2>
            <button onClick={() => onNavigate("catalog")} className="text-[13px] text-[#007D78] hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">{t("learn.showAll")}</button>
          </div>
          <div className="space-y-3">
            {mine.map(item => (
              <button key={item.title} onClick={() => onNavigate("learning")}
                className="w-full text-left bg-white rounded-lg border border-[#C3C9D1] px-4 py-3 hover:border-[#00C8C1] hover:shadow-sm transition-all group flex items-center gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">
                <div className="relative shrink-0">
                  <ProgressRing percent={item.progress} size={40} stroke={3} />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#3A424E]">{item.progress}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#232830] group-hover:text-[#007D78] transition-colors truncate">{item.title}</p>
                  <p className="text-[12px] text-[#5A6472] mt-0.5">ServiceQ · {item.module}</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${item.status === "abgeschlossen" ? "bg-[#EAF8F0] text-[#15803D]" : item.status === "begonnen" ? "bg-[#EBF1FE] text-[#1D5BD6]" : "bg-[#EEF1F4] text-[#5A6472]"}`}>
                  {statusLabel(item.status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
