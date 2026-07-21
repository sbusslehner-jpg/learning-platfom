import { useState } from "react";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { CONTENT_TREE, type Screen } from "../data/demo";

// ─── Editor: Content Tree ─────────────────────────────────────────────────────

export function EditorTree({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [openModules, setOpenModules] = useState<Set<string>>(new Set(["Digital Service Reception (DSR)"]));
  const toggle = (name: string) => setOpenModules(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Tree panel */}
      <div className="w-80 bg-white border-r border-[#E1E5EA] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#EEF1F4] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#232830]">Inhaltsstruktur</h2>
          <button onClick={() => onNavigate("editor-content")}
            className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            <Plus size={14} /> Training
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {CONTENT_TREE.map(({ product, modules }) => (
            <div key={product}>
              <div className="px-4 py-1.5 text-[11px] font-bold text-[#8A93A0] uppercase tracking-wider">{product}</div>
              {modules.map(mod => (
                <div key={mod.name}>
                  <button onClick={() => toggle(mod.name)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#3A424E] hover:bg-[#F6F8FA] transition-colors">
                    <ChevronRight size={14} className={`transition-transform text-[#8A93A0] ${openModules.has(mod.name) ? "rotate-90" : ""}`} />
                    {mod.name}
                  </button>
                  {openModules.has(mod.name) && mod.trainings.map(t => (
                    <button key={t.title} onClick={() => onNavigate("editor-content")}
                      className="w-full flex items-center gap-3 pl-10 pr-4 py-2 text-[13px] text-[#3A424E] hover:bg-[#E6FAF9] transition-colors group">
                      <FileText size={14} className="text-[#8A93A0] shrink-0" />
                      <span className="flex-1 text-left truncate group-hover:text-[#007D78]">{t.title}</span>
                      <StatusBadge status={t.status} compact />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center bg-[#F6F8FA]">
        <EmptyState
          icon={FileText}
          title="Training auswählen"
          body="Wählen Sie links ein Training zur Bearbeitung oder legen Sie ein neues an."
          action="Neues Training"
          onAction={() => onNavigate("editor-content")}
        />
      </div>
    </div>
  );
}
