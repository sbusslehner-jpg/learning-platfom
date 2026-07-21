import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, Eye, GripVertical,
  MoreVertical, Plus, Send, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { ELEMENTS, type Screen } from "../data/demo";

// ─── Editor: Content Editor ───────────────────────────────────────────────────

export function EditorContent({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [saved, setSaved] = useState("14:32");
  const [showPublish, setShowPublish] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(["DE", "AT", "CH"]);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);

  const publish = async () => {
    setPublishing(true);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 120));
      setPublishProgress(i);
    }
    setPublishing(false);
    setShowPublish(false);
    toast.success("Veröffentlicht · Übersetzung läuft");
  };

  const markets = ["DE", "AT", "CH", "FR", "ES", "IT", "PL", "NL", "BE", "PT", "CZ", "HU"];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Editor header */}
        <div className="bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => onNavigate("editor-tree")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#5A6472]">ServiceQ / DSR</div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-[#232830]">DSR – Konfiguration im Einzelhandel</h2>
              <StatusBadge status="draft" compact />
            </div>
          </div>
          <span className="text-[12px] text-[#5A6472] hidden md:block">Gespeichert {saved}</span>
          <button className="px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors flex items-center gap-1.5">
            <Eye size={14} /> Vorschau
          </button>
          <button onClick={() => setShowPublish(true)}
            className="px-4 py-2 rounded-lg font-semibold text-[13px] transition-all flex items-center gap-1.5"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            <Send size={14} /> Veröffentlichen
          </button>
        </div>

        {/* Two-column editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chapter list */}
          <div className="w-56 bg-white border-r border-[#E1E5EA] flex flex-col shrink-0 hidden lg:flex">
            <div className="p-3 border-b border-[#EEF1F4] text-[11px] font-bold text-[#8A93A0] uppercase tracking-wider">Kapitel</div>
            {["Überblick & Konfiguration", "Rollenzuweisung", "DealerData-Sync", "Serviceannahme", "Fehler & Logs"].map((ch, i) => (
              <button key={i}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 text-[13px] transition-colors relative ${i === 0 ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
                {i === 0 && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                <span className={`font-medium ${i === 0 ? "text-[#007D78]" : "text-[#3A424E]"}`}>{i + 1}. {ch}</span>
              </button>
            ))}
            <button className="m-3 flex items-center gap-2 justify-center px-3 py-2 rounded-lg border border-dashed border-[#C3C9D1] text-[12px] text-[#5A6472] hover:border-[#00C8C1] hover:text-[#007D78] transition-colors">
              <Plus size={14} /> Kapitel
            </button>
          </div>

          {/* Element canvas */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#F6F8FA]">
            <h3 className="text-[15px] font-semibold text-[#232830] mb-4">Kapitel 1: Überblick &amp; Konfigurationsebenen</h3>
            <div className="space-y-3">
              {ELEMENTS.map((el, i) => {
                const Icon = el.icon;
                return (
                  <div key={i} className="bg-white rounded-lg border border-[#C3C9D1] px-4 py-3 flex items-center gap-3 group hover:border-[#00C8C1] transition-all">
                    <button className="text-[#C3C9D1] cursor-grab hover:text-[#8A93A0] transition-colors"><GripVertical size={16} /></button>
                    <div className="w-7 h-7 rounded bg-[#F6F8FA] flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-[#5A6472]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-[#232830]">{el.label}</span>
                      <span className="text-[11px] text-[#8A93A0] ml-2">{el.meta}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-[#EEF1F4] transition-colors"><Eye size={14} className="text-[#5A6472]" /></button>
                      <button className="p-1.5 rounded hover:bg-[#EEF1F4] transition-colors" onClick={() => toast(`Element gelöscht · Rückgängig`, { action: { label: "Rückgängig", onClick: () => toast.success("Wiederhergestellt") } })}><Trash2 size={14} className="text-[#B42318]" /></button>
                    </div>
                    <MoreVertical size={16} className="text-[#C3C9D1] group-hover:text-[#8A93A0] transition-colors" />
                  </div>
                );
              })}

              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-[#C3C9D1] text-[13px] text-[#5A6472] hover:border-[#00C8C1] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-all">
                <Plus size={16} /> Element hinzufügen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Publish Panel */}
      {showPublish && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowPublish(false)} />
          <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full">
            <div className="px-6 py-4 border-b border-[#E1E5EA] flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#232830]">Veröffentlichen</h2>
              <button onClick={() => setShowPublish(false)} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Market selection */}
              <div>
                <label className="block text-[13px] font-semibold text-[#3A424E] mb-2">Märkte auswählen</label>
                <div className="flex flex-wrap gap-2">
                  {markets.map(m => (
                    <button key={m} onClick={() => setSelectedMarkets(s => s.includes(m) ? s.filter(x => x !== m) : [...s, m])}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${selectedMarkets.includes(m) ? "bg-[#E6FAF9] border-[#00C8C1] text-[#007D78]" : "bg-white border-[#C3C9D1] text-[#5A6472] hover:border-[#8A93A0]"}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validation */}
              <div>
                <label className="block text-[13px] font-semibold text-[#3A424E] mb-2">Prüfliste</label>
                <div className="space-y-2">
                  {[
                    { ok: true, label: "Titel vorhanden" },
                    { ok: true, label: "Alle Kapitel haben mindestens ein Element" },
                    { ok: false, label: "Beschreibung fehlt (optional)" },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg ${item.ok ? "bg-[#EAF8F0] text-[#15803D]" : "bg-[#FDF3E4] text-[#B45309]"}`}>
                      {item.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Consequence */}
              <div className="bg-[#EBF1FE] rounded-lg px-4 py-3 text-[13px] text-[#1D5BD6]">
                Wird in <strong>{selectedMarkets.length} Sprachen</strong> übersetzt — ca. {selectedMarkets.length * 48} Textfelder werden zum Übersetzungslauf übergeben.
              </div>

              {/* Job progress if publishing */}
              {publishing && (
                <div>
                  <div className="text-[13px] font-semibold text-[#3A424E] mb-2">Übersetzungsjobs</div>
                  <ProgressBar percent={publishProgress} className="mb-1" />
                  <div className="text-[12px] text-[#5A6472]">{publishProgress}% abgeschlossen …</div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#E1E5EA]">
              <button onClick={publish} disabled={publishing}
                className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: publishing ? "#00B3AC" : "#00C8C1", color: "#232830" }}>
                {publishing ? <><span className="w-4 h-4 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" /> Wird veröffentlicht …</> : "Jetzt veröffentlichen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
