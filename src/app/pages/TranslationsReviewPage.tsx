import { useState } from "react";
import { ChevronLeft, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "../components/StatusBadge";
import { REVIEW_FIELDS, STATUS, type Screen, type Status } from "../data/demo";

// ─── Translation Review ───────────────────────────────────────────────────────

export function TranslationReview({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [fields, setFields] = useState(REVIEW_FIELDS.map(f => ({ ...f, editValue: f.translation })));
  const [activeField, setActiveField] = useState(1);
  const [filter, setFilter] = useState<"all" | "outdated" | "error">("all");

  const saveField = (id: number) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, status: "corrected" as Status, translation: f.editValue } : f));
    const next = fields.find(f => f.id > id && (f.status === "outdated" || f.status === "error"));
    if (next) setActiveField(next.id);
    toast.success("Übersetzung gespeichert & gesperrt");
  };

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
            <button key={f.id} onClick={() => setActiveField(f.id)}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors relative ${activeField === f.id ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
              {activeField === f.id && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
              <span style={{ color: STATUS[f.status].color, display: "flex" }}>{STATUS[f.status].icon}</span>
              <span className={`text-[12px] truncate ${activeField === f.id ? "text-[#007D78] font-semibold" : "text-[#3A424E]"}`}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => onNavigate("translations-overview")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4]"><ChevronLeft size={18} /></button>
          <div className="flex-1">
            <p className="text-[12px] text-[#5A6472]">DSR – Konfiguration im Einzelhandel</p>
            <p className="text-[14px] font-semibold text-[#232830]">Französisch (FR)</p>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-[#5A6472]">
            <span className="font-semibold text-[#007D78]">{currentCount}</span>/{fields.length} aktuell
          </div>
        </div>

        {/* Side-by-side */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 max-w-[900px]">
            <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider">Master (Deutsch)</div>
            <div className="text-[11px] font-bold text-[#5A6472] uppercase tracking-wider">Französisch (FR)</div>
          </div>
          <div className="max-w-[900px] space-y-4 mt-3">
            {visible.map(f => {
              const active = activeField === f.id;
              return (
                <div key={f.id} onClick={() => setActiveField(f.id)}
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
                          onChange={e => setFields(prev => prev.map(fi => fi.id === f.id ? { ...fi, editValue: e.target.value } : fi))}
                          className="w-full rounded-lg border border-[#8A93A0] px-3 py-2.5 text-[14px] text-[#232830] resize-none leading-relaxed outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button onClick={e => { e.stopPropagation(); saveField(f.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                            <Lock size={12} /> Korrigieren &amp; sperren
                          </button>
                          <button onClick={e => { e.stopPropagation(); toast.info("Wird neu übersetzt …"); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[#C3C9D1] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
                            <RefreshCw size={12} /> Neu übersetzen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-[14px] leading-relaxed p-3 rounded ${f.status === "corrected" ? "bg-[#EAF8F0] text-[#15803D]" : f.status === "error" ? "bg-[#FDEEEC] text-[#B42318] italic" : "bg-[#F6F8FA] text-[#3A424E]"}`}>
                        {f.translation || <em className="text-[#B42318]">Übersetzung fehlgeschlagen – Klicken zum Bearbeiten</em>}
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
