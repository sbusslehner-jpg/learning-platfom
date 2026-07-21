import { useState } from "react";
import {
  ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, Eye, Play,
} from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "../components/ProgressBar";
import { ProgressRing } from "../components/ProgressRing";
import { CHAPTERS, type Screen } from "../data/demo";

// ─── Completion Screen ────────────────────────────────────────────────────────

function CompletionScreen({ title, onBack, onNext }: { title: string; onBack: () => void; onNext: () => void }) {
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
        <p className="text-[14px] text-[#8A93A0] mb-10">Alle 5 Kapitel wurden erfolgreich durchgearbeitet.</p>

        <div className="bg-white rounded-xl border border-[#C3C9D1] p-5 mb-8 text-left grid grid-cols-3 gap-4 shadow-sm">
          {[
            { label: "Kapitel", value: "5/5" },
            { label: "Elemente", value: "18" },
            { label: "Dauer", value: "51 Min." },
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
            Zur Modulubersicht
          </button>
          <button onClick={onNext}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
          >
            Nachstes Training <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Learning View ────────────────────────────────────────────────────────────

export function LearningView({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [activeChapter, setActiveChapter] = useState(3);
  const [chapterListOpen, setChapterListOpen] = useState(true);
  const [chapterDone, setChapterDone] = useState<Set<number>>(new Set([1, 2]));
  const [showCompletion, setShowCompletion] = useState(false);

  const chapter = CHAPTERS.find(c => c.id === activeChapter)!;
  const allDone = chapterDone.size === CHAPTERS.length;

  const finishChapter = () => {
    const next = CHAPTERS.find(c => c.id > activeChapter && !chapterDone.has(c.id));
    const updated = new Set(chapterDone).add(activeChapter);
    setChapterDone(updated);
    if (next) {
      setActiveChapter(next.id);
      toast.success(`Kapitel ${activeChapter} abgeschlossen`);
    } else {
      setShowCompletion(true);
    }
  };

  const progress = Math.round((chapterDone.size / CHAPTERS.length) * 100);

  if (showCompletion) {
    return (
      <CompletionScreen
        title="DSR – Konfiguration im Einzelhandel"
        onBack={() => onNavigate("training-overview")}
        onNext={() => { setShowCompletion(false); setChapterDone(new Set([1, 2])); setActiveChapter(3); onNavigate("training-overview"); }}
      />
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Chapter sidebar */}
      <div className={`bg-white border-r border-[#E1E5EA] flex-col transition-all duration-200 hidden lg:flex ${chapterListOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        <div className="p-4 border-b border-[#EEF1F4]">
          <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider mb-1">Kapitel</div>
          <ProgressBar percent={progress} className="mt-2" />
          <div className="text-[12px] text-[#5A6472] mt-1">{chapterDone.size}/{CHAPTERS.length} abgeschlossen</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {CHAPTERS.map(ch => (
            <button key={ch.id} onClick={() => setActiveChapter(ch.id)}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors relative ${activeChapter === ch.id ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
              {activeChapter === ch.id && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${chapterDone.has(ch.id) ? "bg-[#00C8C1]" : activeChapter === ch.id ? "border-2 border-[#00C8C1]" : "border-2 border-[#C3C9D1]"}`}>
                {chapterDone.has(ch.id) && <Check size={11} strokeWidth={2.5} color="#232830" />}
              </div>
              <span className={`text-[13px] leading-snug ${activeChapter === ch.id ? "text-[#007D78] font-semibold" : chapterDone.has(ch.id) ? "text-[#5A6472]" : "text-[#3A424E]"}`}>
                {ch.title}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="sticky top-0 bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 z-10">
          <button onClick={() => onNavigate("training-overview")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[#5A6472]">DSR – Konfiguration im Einzelhandel</p>
            <p className="text-[14px] font-semibold text-[#232830] truncate">Kapitel {activeChapter}: {chapter.title}</p>
          </div>
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
            Kapitel {activeChapter}: {chapter.title}
          </h1>

          {activeChapter === 3 && (
            <>
              {/* Video element */}
              <div className="bg-[#2E3540] rounded-lg overflow-hidden mb-6 aspect-video flex items-center justify-center relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[#232830] to-[#3A424E]" />
                <div className="relative flex flex-col items-center gap-3">
                  <button className="w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105"
                    style={{ backgroundColor: "#00C8C1" }}>
                    <Play size={24} fill="#232830" color="#232830" className="ml-1" />
                  </button>
                  <span className="text-white/80 text-[14px]">DealerData-Synchronisation – Einführung (6:42)</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-6 bg-gradient-to-t from-black/60">
                  <div className="h-1 bg-white/20 rounded-full"><div className="h-full w-1/3 bg-[#00C8C1] rounded-full" /></div>
                  <div className="flex justify-between text-white/60 text-[11px] mt-1"><span>2:14</span><span>6:42</span></div>
                </div>
              </div>

              {/* Text content */}
              <p className="text-[17px] text-[#3A424E] leading-[1.75] mb-5">
                Die DealerData-Synchronisation stellt sicher, dass alle Fahrzeug- und Kundendaten zwischen dem DSR-System und dem Händler-DMS synchron gehalten werden. Dieser Prozess läuft automatisch im Hintergrund – jedoch müssen die korrekten Verbindungsparameter einmalig konfiguriert werden.
              </p>
              <p className="text-[17px] text-[#3A424E] leading-[1.75] mb-8">
                Bevor Sie beginnen, stellen Sie sicher, dass die DealerData-API-Zugangsdaten vorliegen. Diese erhalten Sie vom IT-Verantwortlichen Ihres Hauses oder direkt aus dem GroupIT-Partnerportal.
              </p>

              {/* Step instruction */}
              <div className="bg-[#F6F8FA] rounded-lg border border-[#E1E5EA] p-5 mb-6">
                <h3 className="text-[15px] font-semibold text-[#232830] mb-4 flex items-center gap-2">
                  <span className="w-5 h-5 bg-[#2E3540] rounded-full text-white text-[10px] flex items-center justify-center font-bold">★</span>
                  Grundkonfiguration durchführen
                </h3>
                <ol className="space-y-4">
                  {[
                    "Öffnen Sie das DSR-Verwaltungsmenü und navigieren Sie zu Einstellungen > Datensynchronisation.",
                    "Geben Sie die API-URL und den API-Key ein. Achten Sie auf das korrekte Format (https://api.example.com).",
                    "Klicken Sie auf Verbindung testen. Eine grüne Bestätigung erscheint bei Erfolg.",
                    "Legen Sie das Synchronisationsintervall fest (empfohlen: 5 Minuten) und speichern Sie.",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-4">
                      <span className="w-7 h-7 rounded-full bg-[#2E3540] text-white text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-[15px] text-[#3A424E] leading-snug pt-0.5">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Image element */}
              <div className="mb-8">
                <div className="rounded-lg border border-[#C3C9D1] overflow-hidden bg-[#EEF1F4] aspect-[16/7] flex items-center justify-center">
                  <div className="text-center text-[#8A93A0]">
                    <div className="w-12 h-12 bg-[#C3C9D1] rounded-lg mx-auto mb-2 flex items-center justify-center"><Eye size={20} /></div>
                    <p className="text-[13px]">Screenshot: DSR Datensynchronisation</p>
                  </div>
                </div>
                <p className="text-[13px] text-[#5A6472] mt-2 text-center italic">DSR – Einstellungsmenü Datensynchronisation mit API-Konfiguration</p>
              </div>
            </>
          )}

          {activeChapter !== 3 && (
            <p className="text-[17px] text-[#3A424E] leading-[1.75]">
              Inhalt für Kapitel {activeChapter}: {chapter.title}. In einer vollständigen Implementierung stehen hier Texte, Videos, Schritt-Anleitungen und Screenshots aus der ServiceQ-Dokumentation.
            </p>
          )}

          {/* CTA */}
          <div className="mt-10 pt-6 border-t border-[#E1E5EA] flex items-center justify-between">
            {activeChapter > 1 && (
              <button onClick={() => setActiveChapter(activeChapter - 1)}
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
                {chapterDone.has(activeChapter) ? "Nächstes Kapitel" : "Kapitel abschliessen & weiter"} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
