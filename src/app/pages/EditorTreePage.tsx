import { useState } from "react";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import {
  createTraining,
  fetchContentTree,
  useSupabaseData,
  type TreeProduct,
} from "../data/api";
import type { NavHandler } from "../data/demo";
import { DEMO_MODE } from "../data/runtime";

// ─── Editor: Content Tree ─────────────────────────────────────────────────────
// Lädt den echten Inhaltsbaum (Produkt → Modul → Training) aus Supabase.
// Ohne verbundene Datenbank bleibt der Demo-Baum sichtbar – die Seite bricht nie.

const FALLBACK_TREE: TreeProduct[] = [
  {
    product: "ServiceQ",
    modules: [
      {
        id: "demo-dsr",
        name: "Digital Service Reception (DSR)",
        trainings: [
          { id: "demo-dsr-1", title: "Konfiguration im Einzelhandel", status: "published", chapters: 5 },
          { id: "demo-dsr-2", title: "Rollenzuweisung und Berechtigungen", status: "published", chapters: 4 },
          { id: "demo-dsr-3", title: "DealerData-Synchronisation", status: "draft", chapters: 3 },
          { id: "demo-dsr-4", title: "Fehlerbehandlung & Logs", status: "draft", chapters: 4 },
        ],
      },
      {
        id: "demo-rpd",
        name: "Remote Prognose & Diagnose (RPD)",
        trainings: [
          { id: "demo-rpd-1", title: "RPD – Systemüberblick", status: "published", chapters: 3 },
          { id: "demo-rpd-2", title: "RPD – Grundkonfiguration", status: "draft", chapters: 5 },
        ],
      },
    ],
  },
];

export function EditorTree({ onNavigate }: { onNavigate: NavHandler }) {
  const tree = useSupabaseData(fetchContentTree, FALLBACK_TREE, [], DEMO_MODE);

  // Vor der ersten Interaktion ist das erste Modul geöffnet; danach entscheidet
  // die Auswahl des Nutzers (null = noch keine Interaktion).
  const [userOpen, setUserOpen] = useState<Set<string> | null>(null);
  const firstModuleId = tree[0]?.modules[0]?.id;
  const isOpen = (id: string) => (userOpen ? userOpen.has(id) : id === firstModuleId);
  const toggle = (id: string) =>
    setUserOpen(prev => {
      const base = prev ?? new Set(firstModuleId ? [firstModuleId] : []);
      const next = new Set(base);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addTraining = async (moduleId: string | undefined) => {
    if (!moduleId) {
      toast.error("Kein Modul vorhanden");
      return;
    }
    const title = window.prompt("Titel des neuen Trainings")?.trim();
    if (!title) return;
    const newId = await createTraining(moduleId, title);
    if (!newId) {
      toast.error("Nur mit verbundener Datenbank möglich");
      return;
    }
    toast.success("Training angelegt");
    onNavigate("editor-content", newId);
  };

  // Für die obere „+ Training“-Schaltfläche: bevorzugt ein geöffnetes Modul,
  // sonst das erste Modul des Baums.
  const topModuleId =
    tree.flatMap(p => p.modules).find(m => isOpen(m.id))?.id ?? firstModuleId;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Tree panel */}
      <div className="w-80 bg-white border-r border-[#E1E5EA] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#EEF1F4] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#232830]">Inhaltsstruktur</h2>
          <button onClick={() => addTraining(topModuleId)}
            className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            <Plus size={14} /> Training
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {tree.map(({ product, modules }) => (
            <div key={product}>
              <div className="px-4 py-1.5 text-[11px] font-bold text-[#8A93A0] uppercase tracking-wider">{product}</div>
              {modules.map(mod => (
                <div key={mod.id}>
                  <div className="w-full flex items-center gap-1 px-4 py-2 hover:bg-[#F6F8FA] transition-colors group/mod">
                    <button onClick={() => toggle(mod.id)}
                      className="flex-1 flex items-center gap-2 text-[13px] font-semibold text-[#3A424E] text-left min-w-0">
                      <ChevronRight size={14} className={`transition-transform text-[#8A93A0] shrink-0 ${isOpen(mod.id) ? "rotate-90" : ""}`} />
                      <span className="truncate">{mod.name}</span>
                    </button>
                    <button onClick={() => addTraining(mod.id)} title="Training hinzufügen"
                      className="p-1 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] opacity-0 group-hover/mod:opacity-100 transition-all shrink-0">
                      <Plus size={14} />
                    </button>
                  </div>
                  {isOpen(mod.id) && mod.trainings.map(t => (
                    <button key={t.id} onClick={() => onNavigate("editor-content", t.id)}
                      className="w-full flex items-center gap-3 pl-10 pr-4 py-2 text-[13px] text-[#3A424E] hover:bg-[#E6FAF9] transition-colors group">
                      <FileText size={14} className="text-[#8A93A0] shrink-0" />
                      <span className="flex-1 text-left truncate group-hover:text-[#007D78]">{t.title}</span>
                      <StatusBadge status={t.status} compact />
                    </button>
                  ))}
                  {isOpen(mod.id) && mod.trainings.length === 0 && (
                    <div className="pl-10 pr-4 py-2 text-[12px] text-[#8A93A0] italic">Noch keine Trainings</div>
                  )}
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
          onAction={() => addTraining(topModuleId)}
        />
      </div>
    </div>
  );
}
