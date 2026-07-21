import { useEffect, useState } from "react";
import {
  ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, Download, Eye,
  ExternalLink, Globe, Play,
} from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "../components/ProgressBar";
import { ProgressRing } from "../components/ProgressRing";
import { type Screen } from "../data/demo";
import {
  fetchLearningTraining, fetchTranslationMap, useSupabaseData,
  type LearningChapter, type LearningElement, type LearningTraining, type TranslationMap,
} from "../data/api";

// ─── Fallback: Demo-Training (aktiv, solange Supabase nicht verbunden ist) ────

const FALLBACK_TRAINING: LearningTraining = {
  fromDb: false,
  id: "demo-dsr-einzelhandel",
  title: "DSR – Konfiguration im Einzelhandel",
  chapters: [
    { id: "1", title: "Überblick & Konfigurationsebenen", elements: [
      { id: "1-1", type: "text", payload: { body: "<p>Inhalt für Kapitel 1: Überblick & Konfigurationsebenen. In einer vollständigen Implementierung stehen hier Texte, Videos, Schritt-Anleitungen und Screenshots aus der ServiceQ-Dokumentation.</p>" } },
    ]},
    { id: "2", title: "Rollen & Rechte (Dealer_Admin)", elements: [
      { id: "2-1", type: "text", payload: { body: "<p>Inhalt für Kapitel 2: Rollen & Rechte (Dealer_Admin). In einer vollständigen Implementierung stehen hier Texte, Videos, Schritt-Anleitungen und Screenshots aus der ServiceQ-Dokumentation.</p>" } },
    ]},
    { id: "3", title: "DealerData-Synchronisation", elements: [
      { id: "3-1", type: "video", payload: { title: "DealerData-Synchronisation – Einführung", duration: "6:42" } },
      { id: "3-2", type: "text", payload: { body: "<p>Die DealerData-Synchronisation stellt sicher, dass alle Fahrzeug- und Kundendaten zwischen dem DSR-System und dem Händler-DMS synchron gehalten werden. Dieser Prozess läuft automatisch im Hintergrund – jedoch müssen die korrekten Verbindungsparameter einmalig konfiguriert werden.</p><p>Bevor Sie beginnen, stellen Sie sicher, dass die DealerData-API-Zugangsdaten vorliegen. Diese erhalten Sie vom IT-Verantwortlichen Ihres Hauses oder direkt aus dem GroupIT-Partnerportal.</p>" } },
      { id: "3-3", type: "steps", payload: { title: "Grundkonfiguration durchführen", steps: [
        { text: "Öffnen Sie das DSR-Verwaltungsmenü und navigieren Sie zu Einstellungen > Datensynchronisation." },
        { text: "Geben Sie die API-URL und den API-Key ein. Achten Sie auf das korrekte Format (https://api.example.com)." },
        { text: "Klicken Sie auf Verbindung testen. Eine grüne Bestätigung erscheint bei Erfolg." },
        { text: "Legen Sie das Synchronisationsintervall fest (empfohlen: 5 Minuten) und speichern Sie." },
      ]}},
      { id: "3-4", type: "image", payload: { caption: "DSR – Einstellungsmenü Datensynchronisation mit API-Konfiguration" } },
    ]},
    { id: "4", title: "Terminverwaltung & Kalender", elements: [
      { id: "4-1", type: "text", payload: { body: "<p>Inhalt für Kapitel 4: Terminverwaltung & Kalender. In einer vollständigen Implementierung stehen hier Texte, Videos, Schritt-Anleitungen und Screenshots aus der ServiceQ-Dokumentation.</p>" } },
    ]},
    { id: "5", title: "Zusammenfassung & Checkliste", elements: [
      { id: "5-1", type: "text", payload: { body: "<p>Inhalt für Kapitel 5: Zusammenfassung & Checkliste. In einer vollständigen Implementierung stehen hier Texte, Videos, Schritt-Anleitungen und Screenshots aus der ServiceQ-Dokumentation.</p>" } },
    ]},
  ],
};

// ─── Sprachwahl & Übersetzungs-Fallback ──────────────────────────────────────

const LEARN_LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pl", label: "Polski" },
  { code: "it", label: "Italiano" },
];

/** Kennzeichnung "🌐 Original", wenn der Master-Text angezeigt wird (Konzept §5). */
function OriginalChip() {
  return (
    <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full bg-[#EEF1F4] text-[#5A6472] text-[10px] font-medium align-middle whitespace-nowrap">
      <Globe size={9} /> Original
    </span>
  );
}

// ─── Elementdarstellung (die 6 Typen aus Konzept §4) ─────────────────────────

function ElementView({ element, tr }: {
  element: LearningElement;
  tr: (refId: string, field: string, master: string | undefined) => { text: string; original: boolean };
}) {
  const p = element.payload ?? {};
  switch (element.type) {
    case "video": {
      const title = tr(element.id, "title", p.title);
      return (
        <div className="bg-[#2E3540] rounded-lg overflow-hidden mb-6 aspect-video flex items-center justify-center relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[#232830] to-[#3A424E]" />
          <div className="relative flex flex-col items-center gap-3 px-4 text-center">
            <button className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105"
              style={{ backgroundColor: "#00C8C1" }} aria-label="Video abspielen">
              <Play size={24} fill="#232830" color="#232830" className="ml-1" />
            </button>
            <span className="text-white/80 text-[14px]">
              {title.text}{p.duration ? ` (${p.duration})` : ""}
              {title.original && <OriginalChip />}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-6 bg-gradient-to-t from-black/60">
            <div className="h-1 bg-white/20 rounded-full"><div className="h-full w-0 bg-[#00C8C1] rounded-full" /></div>
          </div>
        </div>
      );
    }
    case "text": {
      const body = tr(element.id, "body", p.body);
      return (
        <div className="mb-8">
          {/* Inhalte stammen aus der eigenen Redaktion (RLS-gesichert) */}
          <div
            className="text-[17px] text-[#3A424E] leading-[1.75] [&_p]:mb-5 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:text-[#232830] [&_h3]:mb-3 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-5 [&_a]:text-[#007D78] [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: body.text }}
          />
          {body.original && <OriginalChip />}
        </div>
      );
    }
    case "steps": {
      const title = tr(element.id, "title", p.title ?? "Schrittanleitung");
      const steps: { text: string }[] = Array.isArray(p.steps) ? p.steps : [];
      return (
        <div className="bg-[#F6F8FA] rounded-lg border border-[#E1E5EA] p-5 mb-6">
          <h3 className="text-[15px] font-semibold text-[#232830] mb-4 flex items-center gap-2">
            <span className="w-5 h-5 bg-[#2E3540] rounded-full text-white text-[10px] flex items-center justify-center font-bold">★</span>
            {title.text}{title.original && <OriginalChip />}
          </h3>
          <ol className="space-y-4">
            {steps.map((step, i) => {
              const s = tr(element.id, `steps.${i}.text`, step.text);
              return (
                <li key={i} className="flex gap-4">
                  <span className="w-7 h-7 rounded-full bg-[#2E3540] text-white text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-[15px] text-[#3A424E] leading-snug pt-0.5">{s.text}{s.original && <OriginalChip />}</p>
                </li>
              );
            })}
          </ol>
        </div>
      );
    }
    case "image": {
      const caption = tr(element.id, "caption", p.caption);
      return (
        <div className="mb-8">
          <div className="rounded-lg border border-[#C3C9D1] overflow-hidden bg-[#EEF1F4] aspect-[16/7] flex items-center justify-center">
            <div className="text-center text-[#8A93A0]">
              <div className="w-12 h-12 bg-[#C3C9D1] rounded-lg mx-auto mb-2 flex items-center justify-center"><Eye size={20} /></div>
              <p className="text-[13px]">Screenshot</p>
            </div>
          </div>
          {caption.text && (
            <p className="text-[13px] text-[#5A6472] mt-2 text-center italic">
              {caption.text}{caption.original && <OriginalChip />}
            </p>
          )}
        </div>
      );
    }
    case "document": {
      const label = tr(element.id, "label", p.label ?? "Dokument");
      return (
        <button className="w-full flex items-center gap-3 bg-white rounded-lg border border-[#C3C9D1] px-4 py-3 mb-6 hover:border-[#00C8C1] hover:shadow-sm transition-all text-left">
          <div className="w-10 h-10 rounded-lg bg-[#E6FAF9] flex items-center justify-center shrink-0">
            <Download size={18} style={{ color: "#009D97" }} />
          </div>
          <span className="text-[14px] font-semibold text-[#232830]">{label.text}{label.original && <OriginalChip />}</span>
        </button>
      );
    }
    case "link": {
      const label = tr(element.id, "label", p.label ?? p.url);
      return (
        <a href={p.url} target="_blank" rel="noreferrer"
          className="w-full flex items-center gap-3 bg-white rounded-lg border border-[#C3C9D1] px-4 py-3 mb-6 hover:border-[#00C8C1] hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-[#E6FAF9] flex items-center justify-center shrink-0">
            <ExternalLink size={18} style={{ color: "#009D97" }} />
          </div>
          <span className="text-[14px] font-semibold text-[#007D78]">{label.text}{label.original && <OriginalChip />}</span>
        </a>
      );
    }
    default:
      return null;
  }
}

// ─── Completion Screen ────────────────────────────────────────────────────────

function CompletionScreen({ title, chapterCount, elementCount, duration, onBack, onNext }: {
  title: string; chapterCount: number; elementCount: number; duration: string;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[#F6F8FA]">
      <div className="max-w-[520px] w-full text-center">
        {/* Ring */}
        <div className="relative inline-flex mb-8">
          <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={70} cy={70} r={58} fill="none" stroke="#E6FAF9" strokeWidth={8} />
            <circle cx={70} cy={70} r={58} fill="none" stroke="#00C8C1" strokeWidth={8}
              strokeDasharray={364.4} strokeDashoffset={0} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <CheckCircle2 size={36} style={{ color: "#00C8C1" }} strokeWidth={1.5} />
            <span className="text-[13px] font-bold text-[#232830] mt-1">100%</span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF8F0] text-[#15803D] text-[12px] font-semibold mb-4">
          <CheckCircle2 size={13} /> Abgeschlossen
        </div>

        <h1 className="text-[26px] font-semibold text-[#232830] leading-tight mb-2">Training abgeschlossen</h1>
        <p className="text-[16px] text-[#5A6472] mb-2">{title}</p>
        <p className="text-[14px] text-[#8A93A0] mb-10">Alle {chapterCount} Kapitel wurden erfolgreich durchgearbeitet.</p>

        <div className="bg-white rounded-xl border border-[#C3C9D1] p-5 mb-8 text-left grid grid-cols-3 gap-4 shadow-sm">
          {[
            { label: "Kapitel", value: `${chapterCount}/${chapterCount}` },
            { label: "Elemente", value: `${elementCount}` },
            { label: "Dauer", value: duration },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[22px] font-bold text-[#232830] tabular-nums">{s.value}</div>
              <div className="text-[12px] text-[#5A6472] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={onBack}
            className="px-6 py-2.5 rounded-lg border border-[#C3C9D1] text-[14px] font-semibold text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
            Zur Modulübersicht
          </button>
          <button onClick={onNext}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
          >
            Nächstes Training <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Learning View ────────────────────────────────────────────────────────────

const progressKey = (trainingId: string) => `sq-progress:${trainingId}`;

function loadProgress(trainingId: string): Set<string> {
  try {
    const raw = localStorage.getItem(progressKey(trainingId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveProgress(trainingId: string, done: Set<string>) {
  try {
    localStorage.setItem(progressKey(trainingId), JSON.stringify([...done]));
  } catch {
    /* Speicher voll o. ä. – Fortschritt bleibt für die Sitzung im State */
  }
}

export function LearningView({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const training = useSupabaseData(
    () => fetchLearningTraining("dsr-konfiguration-einzelhandel"),
    FALLBACK_TRAINING,
  );
  const chapters: LearningChapter[] = training.chapters;

  const [activeIdx, setActiveIdx] = useState(0);
  const [chapterListOpen, setChapterListOpen] = useState(true);
  const [chapterDone, setChapterDone] = useState<Set<string>>(() => loadProgress(FALLBACK_TRAINING.id));
  const [showCompletion, setShowCompletion] = useState(false);
  const [lang, setLang] = useState("de");
  const [translations, setTranslations] = useState<TranslationMap>({});

  // Fortschritt und Kapitelindex neu laden, wenn das echte Training eintrifft
  useEffect(() => {
    setChapterDone(loadProgress(training.id));
    setActiveIdx(0);
  }, [training.id]);

  // Übersetzungen für die gewählte Sprache laden (nur bei echten Daten)
  useEffect(() => {
    if (!training.fromDb || lang === "de") {
      setTranslations({});
      return;
    }
    let alive = true;
    const refIds = [
      training.id,
      ...chapters.map(c => c.id),
      ...chapters.flatMap(c => c.elements.map(e => e.id)),
    ];
    fetchTranslationMap(refIds, lang)
      .then(map => { if (alive && map) setTranslations(map); })
      .catch(() => {});
    return () => { alive = false; };
  }, [training.id, training.fromDb, lang]);

  const chapter = chapters[activeIdx];
  const elementCount = chapters.reduce((n, c) => n + c.elements.length, 0);
  const duration = `${Math.max(10, chapters.length * 12)} Min.`;

  // Übersetzungs-Lookup mit Master-Fallback ("🌐 Original", Konzept §5)
  const trField = (refType: string) => (refId: string, field: string, master: string | undefined) => {
    const masterText = master ?? "";
    if (lang === "de") return { text: masterText, original: false };
    const hit = translations[`${refType}:${refId}:${field}`];
    if (hit?.text && (hit.status === "auto" || hit.status === "edited" || hit.status === "outdated")) {
      return { text: hit.text, original: false };
    }
    return { text: masterText, original: true };
  };
  const trChapter = trField("chapter");
  const trElement = trField("content_element");

  const finishChapter = () => {
    const updated = new Set(chapterDone).add(chapter.id);
    setChapterDone(updated);
    saveProgress(training.id, updated);
    const nextIdx = chapters.findIndex((c, i) => i > activeIdx && !updated.has(c.id));
    if (nextIdx !== -1) {
      setActiveIdx(nextIdx);
      toast.success(`Kapitel ${activeIdx + 1} abgeschlossen`);
    } else if (updated.size >= chapters.length) {
      setShowCompletion(true);
    } else {
      toast.success(`Kapitel ${activeIdx + 1} abgeschlossen`);
    }
  };

  const progress = Math.round((chapterDone.size / chapters.length) * 100);

  if (showCompletion) {
    return (
      <CompletionScreen
        title={training.title}
        chapterCount={chapters.length}
        elementCount={elementCount}
        duration={duration}
        onBack={() => onNavigate("training-overview")}
        onNext={() => { setShowCompletion(false); onNavigate("training-overview"); }}
      />
    );
  }

  const chapterTitle = trChapter(chapter.id, "title", chapter.title);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Chapter sidebar */}
      <div className={`bg-white border-r border-[#E1E5EA] flex-col transition-all duration-200 hidden lg:flex ${chapterListOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        <div className="p-4 border-b border-[#EEF1F4]">
          <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider mb-1">Kapitel</div>
          <ProgressBar percent={progress} className="mt-2" />
          <div className="text-[12px] text-[#5A6472] mt-1">{chapterDone.size}/{chapters.length} abgeschlossen</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {chapters.map((ch, i) => {
            const t = trChapter(ch.id, "title", ch.title);
            return (
              <button key={ch.id} onClick={() => setActiveIdx(i)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors relative ${activeIdx === i ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
                {activeIdx === i && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${chapterDone.has(ch.id) ? "bg-[#00C8C1]" : activeIdx === i ? "border-2 border-[#00C8C1]" : "border-2 border-[#C3C9D1]"}`}>
                  {chapterDone.has(ch.id) && <Check size={11} strokeWidth={2.5} color="#232830" />}
                </div>
                <span className={`text-[13px] leading-snug ${activeIdx === i ? "text-[#007D78] font-semibold" : chapterDone.has(ch.id) ? "text-[#5A6472]" : "text-[#3A424E]"}`}>
                  {t.text}{t.original && <OriginalChip />}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 z-10">
          <button onClick={() => onNavigate("training-overview")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[#5A6472]">{training.title}</p>
            <p className="text-[14px] font-semibold text-[#232830] truncate">Kapitel {activeIdx + 1}: {chapterTitle.text}</p>
          </div>
          {training.fromDb && (
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="text-[13px] text-[#3A424E] border border-[#C3C9D1] rounded-lg px-2 py-1.5 bg-white hover:border-[#8A93A0] transition-colors"
              aria-label="Anzeigesprache"
            >
              {LEARN_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          )}
          <div className="hidden lg:flex items-center gap-2">
            <div className="relative w-8 h-8">
              <ProgressRing percent={progress} size={32} stroke={3} />
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-[#232830]">{progress}%</span>
            </div>
          </div>
          <button onClick={() => setChapterListOpen(!chapterListOpen)}
            className="hidden lg:flex items-center gap-1 text-[13px] text-[#5A6472] hover:text-[#3A424E] px-2 py-1.5 rounded-lg hover:bg-[#EEF1F4] transition-colors">
            <BookOpen size={15} /> Kapitel
          </button>
        </div>

        {/* Content */}
        <div className="max-w-[720px] mx-auto px-6 lg:px-8 py-8">
          <h1 className="text-[24px] font-semibold text-[#232830] mb-6 leading-tight">
            Kapitel {activeIdx + 1}: {chapterTitle.text}{chapterTitle.original && <OriginalChip />}
          </h1>

          {chapter.elements.map(el => (
            <ElementView key={el.id} element={el} tr={trElement} />
          ))}

          {/* CTA */}
          <div className="mt-10 pt-6 border-t border-[#E1E5EA] flex items-center justify-between">
            {activeIdx > 0 && (
              <button onClick={() => setActiveIdx(activeIdx - 1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#C3C9D1] text-[14px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
                <ChevronLeft size={16} /> Vorheriges Kapitel
              </button>
            )}
            <div className="ml-auto">
              <button onClick={finishChapter}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
                style={{ backgroundColor: "#00C8C1", color: "#232830" }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
              >
                {chapterDone.has(chapter.id) ? "Nächstes Kapitel" : "Kapitel abschließen & weiter"} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
