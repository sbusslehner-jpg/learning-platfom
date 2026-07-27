import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  AlertTriangle, Archive, BookMarked, CheckCircle2, ChevronLeft, Download, Eye,
  FileText, GripVertical, Link as LinkIcon, MoreVertical, Pencil, Play,
  Plus, Send, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "../components/ProgressBar";
import { StatusBadge } from "../components/StatusBadge";
import { ELEMENTS, type NavHandler } from "../data/demo";
import {
  archiveTraining, createChapter, createElement, deleteChapter, deleteElement,
  fetchAppSettings, fetchEditorTraining, fetchMarkets, fetchTrainingMarketIds, publishTraining,
  triggerTranslation, updateChapterTitle, updateElementPayload, updateTrainingMeta,
  type EditorElement, type EditorTraining, type MarketOption,
} from "../data/api";
import { DEMO_MODE } from "../data/runtime";

// ─── Editor: Content Editor ───────────────────────────────────────────────────
// Bearbeitet ein echtes Training (Kapitel, Elemente, Märkte) über Supabase.
// Ohne verbundene Datenbank fällt die Seite auf die Demo-Ansicht (unten) zurück.

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  steps: "Schrittanleitung",
  video: "Video",
  image: "Bild",
  document: "Dokument",
  link: "Link",
};

const ELEMENT_TYPES: { type: string; label: string; Icon: React.ElementType }[] = [
  { type: "text", label: "Text", Icon: FileText },
  { type: "steps", label: "Schrittanleitung", Icon: BookMarked },
  { type: "video", label: "Video", Icon: Play },
  { type: "image", label: "Bild", Icon: Eye },
  { type: "document", label: "Dokument", Icon: Download },
  { type: "link", label: "Link", Icon: LinkIcon },
];

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function elementView(el: EditorElement): { Icon: React.ElementType; label: string } {
  const p = el.payload ?? {};
  switch (el.type) {
    case "video": return { Icon: Play, label: p.title || "Ohne Titel" };
    case "text": return { Icon: FileText, label: (p.body ? stripHtml(String(p.body)).slice(0, 40) : "") || "Leerer Text" };
    case "steps": return { Icon: BookMarked, label: p.title || `${(p.steps ?? []).length} Schritte` };
    case "image": return { Icon: Eye, label: p.caption || "Bild" };
    case "document": return { Icon: Download, label: p.label || "Dokument" };
    case "link": return { Icon: LinkIcon, label: p.label || p.url || "Link" };
    default: return { Icon: FileText, label: el.type };
  }
}

const inputCls =
  "w-full rounded-lg border border-[#C3C9D1] px-3 py-2 text-[13px] text-[#232830] outline-none focus:border-[#00C8C1] focus:ring-2 focus:ring-[#00C8C1]/20 transition-all";
const fieldLabelCls = "block text-[11px] font-semibold text-[#5A6472] mb-1";

function ElementEditor({ el, onChange }: { el: EditorElement; onChange: (p: any) => void }) {
  const p = el.payload ?? {};
  switch (el.type) {
    case "text":
      return (
        <textarea className={`${inputCls} resize-none leading-relaxed`} rows={4} placeholder="Text …"
          value={p.body ?? ""} onChange={e => onChange({ ...p, body: e.target.value })} />
      );
    case "video":
      return (
        <div className="space-y-2">
          <div><label className={fieldLabelCls}>Titel</label><input className={inputCls} value={p.title ?? ""} onChange={e => onChange({ ...p, title: e.target.value })} /></div>
          <div><label className={fieldLabelCls}>Beschreibung</label><input className={inputCls} value={p.description ?? ""} onChange={e => onChange({ ...p, description: e.target.value })} /></div>
        </div>
      );
    case "steps": {
      const steps: any[] = Array.isArray(p.steps) ? p.steps : [];
      return (
        <div className="space-y-2">
          <div><label className={fieldLabelCls}>Titel</label><input className={inputCls} value={p.title ?? ""} onChange={e => onChange({ ...p, title: e.target.value })} /></div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#8A93A0] w-5 shrink-0">{i + 1}.</span>
                <input className={inputCls} value={s?.text ?? ""}
                  onChange={e => onChange({ ...p, steps: steps.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)) })} />
                <button onClick={() => onChange({ ...p, steps: steps.filter((_, xi) => xi !== i) })}
                  className="p-1 rounded text-[#B42318] hover:bg-[#FDEEEC] transition-colors shrink-0"><X size={12} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => onChange({ ...p, steps: [...steps, { text: "" }] })}
            className="flex items-center gap-1.5 text-[12px] text-[#007D78] font-semibold hover:underline"><Plus size={12} /> Schritt</button>
        </div>
      );
    }
    case "image":
      return (<div><label className={fieldLabelCls}>Bildunterschrift</label><input className={inputCls} value={p.caption ?? ""} onChange={e => onChange({ ...p, caption: e.target.value })} /></div>);
    case "link":
      return (
        <div className="space-y-2">
          <div><label className={fieldLabelCls}>Bezeichnung</label><input className={inputCls} value={p.label ?? ""} onChange={e => onChange({ ...p, label: e.target.value })} /></div>
          <div><label className={fieldLabelCls}>URL</label><input className={inputCls} value={p.url ?? ""} onChange={e => onChange({ ...p, url: e.target.value })} /></div>
        </div>
      );
    case "document":
      return (<div><label className={fieldLabelCls}>Bezeichnung</label><input className={inputCls} value={p.label ?? ""} onChange={e => onChange({ ...p, label: e.target.value })} /></div>);
    default:
      return <div className="text-[12px] text-[#8A93A0]">Kein Editor für diesen Typ.</div>;
  }
}

function ElementCard({ el, expanded, onToggle, onDelete, onChange }: {
  el: EditorElement; expanded: boolean;
  onToggle: () => void; onDelete: () => void; onChange: (p: any) => void;
}) {
  const { Icon, label } = elementView(el);
  return (
    <div className={`bg-white rounded-lg border px-4 py-3 transition-all ${expanded ? "border-[#00C8C1] shadow-sm" : "border-[#C3C9D1] hover:border-[#00C8C1]"}`}>
      <div className="flex items-center gap-3 group">
        <button className="text-[#C3C9D1] cursor-grab hover:text-[#8A93A0] transition-colors" title="Ziehen (nur visuell)"><GripVertical size={16} /></button>
        <div className="w-7 h-7 rounded bg-[#F6F8FA] flex items-center justify-center shrink-0">
          <Icon size={14} className="text-[#5A6472]" />
        </div>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <span className="text-[13px] font-medium text-[#232830]">{TYPE_LABELS[el.type] ?? el.type}</span>
          <span className="text-[11px] text-[#8A93A0] ml-2">{label}</span>
        </button>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-[#EEF1F4] transition-colors" title="Bearbeiten"><Pencil size={14} className="text-[#5A6472]" /></button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-[#EEF1F4] transition-colors" title="Löschen"><Trash2 size={14} className="text-[#B42318]" /></button>
        </div>
        <MoreVertical size={16} className="text-[#C3C9D1] group-hover:text-[#8A93A0] transition-colors" />
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#EEF1F4]">
          <ElementEditor el={el} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

export function EditorContent({ onNavigate }: { onNavigate: NavHandler }) {
  const { trainingId } = useParams();

  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState<EditorTraining | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [expandedEl, setExpandedEl] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [chapterDraft, setChapterDraft] = useState("");

  const [showPublish, setShowPublish] = useState(false);
  const [markets, setMarkets] = useState<MarketOption[] | null>(null);
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ─── Laden (bei jedem Trainingswechsel neu) ────────────────────────────────
  useEffect(() => {
    if (!trainingId) { setLoading(false); setTraining(null); return; }
    let alive = true;
    setLoading(true);
    fetchEditorTraining(trainingId)
      .then(t => {
        if (!alive) return;
        setTraining(t);
        setActiveChapterId(t?.chapters[0]?.id ?? null);
        setTitleDraft(t?.title ?? "");
        setLoading(false);
      })
      .catch(() => { if (alive) { setTraining(null); setLoading(false); } });
    return () => { alive = false; };
  }, [trainingId]);

  const refresh = async (selectChapter?: string) => {
    if (!trainingId) return;
    const t = await fetchEditorTraining(trainingId);
    if (!t) return;
    setTraining(t);
    setActiveChapterId(prev =>
      selectChapter ?? (t.chapters.some(c => c.id === prev) ? prev : t.chapters[0]?.id ?? null));
  };

  const fmtTime = (d: Date) => d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  // ─── Trainingstitel ────────────────────────────────────────────────────────
  const saveTitle = async () => {
    const v = titleDraft.trim();
    if (!training) return;
    if (!v || v === training.title) { setTitleDraft(training.title); return; }
    const ok = await updateTrainingMeta(training.id, { title: v });
    if (ok) { setTraining(t => (t ? { ...t, title: v } : t)); setSavedAt(new Date()); }
    else { toast.error("Nur mit verbundener Datenbank möglich"); }
  };

  // ─── Kapitel ───────────────────────────────────────────────────────────────
  const addChapter = async () => {
    if (!training) return;
    const id = await createChapter(training.id, "Neues Kapitel", training.chapters.length);
    if (!id) { toast.error("Nur mit verbundener Datenbank möglich"); return; }
    await refresh(id);
    toast.success("Kapitel hinzugefügt");
  };

  const commitChapterTitle = async (id: string) => {
    const v = chapterDraft.trim();
    setEditingChapter(null);
    const ch = training?.chapters.find(c => c.id === id);
    if (!ch || !v || v === ch.title) return;
    const ok = await updateChapterTitle(id, v);
    if (ok) {
      setTraining(t => (t ? { ...t, chapters: t.chapters.map(c => (c.id === id ? { ...c, title: v } : c)) } : t));
      setSavedAt(new Date());
    } else { toast.error("Nur mit verbundener Datenbank möglich"); }
  };

  const removeChapter = async (id: string) => {
    const ok = await deleteChapter(id);
    if (!ok) { toast.error("Nur mit verbundener Datenbank möglich"); return; }
    setTraining(t => (t ? { ...t, chapters: t.chapters.filter(c => c.id !== id) } : t));
    if (activeChapterId === id) {
      setActiveChapterId(training?.chapters.find(c => c.id !== id)?.id ?? null);
    }
    toast.success("Kapitel gelöscht");
  };

  // ─── Elemente ──────────────────────────────────────────────────────────────
  const patchElement = (chapterId: string, elId: string, payload: any) => {
    setTraining(t => (t ? {
      ...t,
      chapters: t.chapters.map(c => (c.id !== chapterId ? c
        : { ...c, elements: c.elements.map(e => (e.id === elId ? { ...e, payload } : e)) })),
    } : t));
    clearTimeout(saveTimers.current[elId]);
    saveTimers.current[elId] = setTimeout(async () => {
      const ok = await updateElementPayload(elId, payload);
      if (ok) setSavedAt(new Date());
      else toast.error("Speichern fehlgeschlagen");
    }, 600);
  };

  const addElement = async (chapterId: string, type: string) => {
    setAddMenuOpen(false);
    const chapter = training?.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    const created = await createElement(chapterId, type, chapter.elements.length);
    if (!created) { toast.error("Nur mit verbundener Datenbank möglich"); return; }
    setTraining(t => (t ? {
      ...t,
      chapters: t.chapters.map(c => (c.id === chapterId ? { ...c, elements: [...c.elements, created] } : c)),
    } : t));
    setExpandedEl(created.id);
    setSavedAt(new Date());
  };

  const removeElement = async (chapterId: string, el: EditorElement) => {
    const ok = await deleteElement(el.id);
    if (!ok) { toast.error("Nur mit verbundener Datenbank möglich"); return; }
    setTraining(t => (t ? {
      ...t,
      chapters: t.chapters.map(c => (c.id === chapterId ? { ...c, elements: c.elements.filter(e => e.id !== el.id) } : c)),
    } : t));
    setSavedAt(new Date());
    toast("Element gelöscht", {
      action: {
        label: "Rückgängig",
        onClick: async () => {
          const created = await createElement(chapterId, el.type, el.sort);
          if (!created) { toast.error("Wiederherstellen fehlgeschlagen"); return; }
          await updateElementPayload(created.id, el.payload);
          await refresh();
          toast.success("Wiederhergestellt");
        },
      },
    });
  };

  // ─── Veröffentlichen ───────────────────────────────────────────────────────
  const openPublish = async () => {
    setShowPublish(true);
    if (!markets) {
      const m = await fetchMarkets();
      if (m) setMarkets(m);
    }
    if (trainingId) {
      const ids = await fetchTrainingMarketIds(trainingId);
      if (ids.length) setSelectedMarketIds(ids);
    }
  };

  const doPublish = async () => {
    if (!trainingId) return;
    const contentComplete =
      !!training?.title.trim() &&
      !!training?.chapters.length &&
      training.chapters.every(c => c.elements.length > 0);
    if (!contentComplete || selectedMarketIds.length === 0) {
      toast.error("Titel, befüllte Kapitel und mindestens ein Markt sind erforderlich.");
      return;
    }
    setPublishing(true);
    const ok = await publishTraining(trainingId, selectedMarketIds);
    setPublishing(false);
    if (!ok) { toast.error("Veröffentlichen fehlgeschlagen"); return; }
    toast.success("Veröffentlicht");
    setTraining(t => (t ? { ...t, status: "published" } : t));
    setSavedAt(new Date());
    setShowPublish(false);
    // Übersetzungslauf nur bei aktivierter Automatik anstoßen.
    fetchAppSettings()
      .then(settings => {
        if (settings?.["translation.auto_on_publish"] === false) return null;
        return triggerTranslation(trainingId);
      })
      .then(res => {
        if (!res) return;
        if (res.ok) toast.success(res.message);
        else toast.info("Übersetzungslauf konnte nicht gestartet werden – Worker ggf. nicht deployt.");
      })
      .catch(() => toast.info("Übersetzungslauf konnte nicht gestartet werden – Worker ggf. nicht deployt."));
  };

  const doArchive = async () => {
    if (!trainingId || !window.confirm("Dieses Training archivieren? Lernende können es danach nicht mehr öffnen.")) return;
    const ok = await archiveTraining(trainingId);
    if (!ok) { toast.error("Archivieren fehlgeschlagen"); return; }
    setTraining(t => (t ? { ...t, status: "archived" } : t));
    setSavedAt(new Date());
    toast.success("Training archiviert");
  };

  // ─── Kein Training gewählt ─────────────────────────────────────────────────
  if (!trainingId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F6F8FA]">
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#EEF1F4] flex items-center justify-center mb-4">
            <FileText size={28} style={{ color: "#C3C9D1" }} strokeWidth={1.5} />
          </div>
          <h3 className="text-[16px] font-semibold text-[#3A424E] mb-2">Kein Training gewählt</h3>
          <p className="text-[14px] text-[#5A6472] max-w-xs mb-6">Wählen Sie in der Inhaltsstruktur ein Training zur Bearbeitung aus.</p>
          <button onClick={() => onNavigate("editor-tree")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            Zur Inhaltsstruktur
          </button>
        </div>
      </div>
    );
  }

  // ─── Ladezustand ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F6F8FA]">
        <div className="flex items-center gap-2 text-[14px] text-[#5A6472]">
          <span className="w-4 h-4 border-2 border-[#C3C9D1] border-t-[#00C8C1] rounded-full animate-spin" />
          Lädt …
        </div>
      </div>
    );
  }

  // ─── Demo-Ansicht (Supabase nicht verbunden oder Datensatz fehlt) ──────────
  if (!training) {
    if (DEMO_MODE) return <DemoEditor onNavigate={onNavigate} />;
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F6F8FA] p-6">
        <div role="alert" className="bg-white rounded-xl border border-[#B42318]/30 max-w-md p-6 text-center">
          <h1 className="text-[18px] font-semibold text-[#232830] mb-2">Training nicht verfügbar</h1>
          <p className="text-[14px] text-[#5A6472] mb-4">Der Datensatz konnte nicht geladen werden oder Sie haben keinen Zugriff.</p>
          <button onClick={() => onNavigate("editor-tree")} className="px-4 py-2 rounded-lg bg-[#00C8C1] font-semibold">
            Zur Inhaltsstruktur
          </button>
        </div>
      </div>
    );
  }

  // ─── Echter Editor ─────────────────────────────────────────────────────────
  const activeChapter = training.chapters.find(c => c.id === activeChapterId) ?? training.chapters[0] ?? null;
  const activeIndex = training.chapters.findIndex(c => c.id === activeChapter?.id);

  const selectedMarkets = (markets ?? []).filter(m => selectedMarketIds.includes(m.id));
  const targetLangs = [...new Set(selectedMarkets.flatMap(m => m.languages))].filter(l => l !== "de");

  const checklist = [
    { ok: !!training.title.trim(), label: "Titel vorhanden" },
    {
      ok: training.chapters.length > 0 && training.chapters.every(c => c.elements.length > 0),
      label: "Jedes Kapitel hat mindestens ein Element",
    },
    { ok: !!training.description?.trim(), label: "Beschreibung vorhanden (optional)" },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Editor header */}
        <div className="bg-white border-b border-[#E1E5EA] px-6 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => onNavigate("editor-tree")} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><ChevronLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#5A6472] truncate">{training.productTitle} / {training.moduleTitle}</div>
            <div className="flex items-center gap-2">
              <input
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="text-[15px] font-semibold text-[#232830] bg-transparent outline-none rounded px-1 -mx-1 min-w-0 flex-1 hover:bg-[#F6F8FA] focus:bg-[#F6F8FA] focus:ring-2 focus:ring-[#00C8C1]/20 transition-all"
              />
              <StatusBadge status={training.status} compact />
            </div>
          </div>
          {savedAt && <span className="text-[12px] text-[#5A6472] hidden md:block">Gespeichert {fmtTime(savedAt)}</span>}
          <button className="px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors flex items-center gap-1.5">
            <Eye size={14} /> Vorschau
          </button>
          {training.status === "published" && (
            <button onClick={doArchive}
              className="px-4 py-2 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors flex items-center gap-1.5">
              <Archive size={14} /> Archivieren
            </button>
          )}
          <button onClick={openPublish}
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
            <div className="flex-1 overflow-y-auto">
              {training.chapters.map((ch, i) => {
                const active = ch.id === activeChapter?.id;
                return (
                  <div key={ch.id}
                    className={`w-full px-3 py-2.5 flex items-center gap-2 text-[13px] transition-colors relative group/ch ${active ? "bg-[#E6FAF9]" : "hover:bg-[#F6F8FA]"}`}>
                    {active && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                    {editingChapter === ch.id ? (
                      <input autoFocus value={chapterDraft}
                        onChange={e => setChapterDraft(e.target.value)}
                        onBlur={() => commitChapterTitle(ch.id)}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingChapter(null); }}
                        className="flex-1 min-w-0 text-[13px] font-medium text-[#232830] bg-white rounded border border-[#00C8C1] px-1.5 py-0.5 outline-none" />
                    ) : (
                      <>
                        <button onClick={() => setActiveChapterId(ch.id)}
                          onDoubleClick={() => { setEditingChapter(ch.id); setChapterDraft(ch.title); }}
                          className={`flex-1 min-w-0 text-left font-medium truncate ${active ? "text-[#007D78]" : "text-[#3A424E]"}`}>
                          {i + 1}. {ch.title}
                        </button>
                        <button onClick={() => { setEditingChapter(ch.id); setChapterDraft(ch.title); }}
                          title="Umbenennen"
                          className="p-1 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-white opacity-0 group-hover/ch:opacity-100 transition-all shrink-0"><Pencil size={12} /></button>
                        <button onClick={() => removeChapter(ch.id)}
                          title="Kapitel löschen"
                          className="p-1 rounded text-[#B42318] hover:bg-white opacity-0 group-hover/ch:opacity-100 transition-all shrink-0"><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                );
              })}
              {training.chapters.length === 0 && (
                <div className="px-3 py-3 text-[12px] text-[#8A93A0] italic">Noch keine Kapitel</div>
              )}
            </div>
            <button onClick={addChapter}
              className="m-3 flex items-center gap-2 justify-center px-3 py-2 rounded-lg border border-dashed border-[#C3C9D1] text-[12px] text-[#5A6472] hover:border-[#00C8C1] hover:text-[#007D78] transition-colors">
              <Plus size={14} /> Kapitel
            </button>
          </div>

          {/* Element canvas */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#F6F8FA]">
            {activeChapter ? (
              <>
                <h3 className="text-[15px] font-semibold text-[#232830] mb-4">Kapitel {activeIndex + 1}: {activeChapter.title}</h3>
                <div className="space-y-3">
                  {activeChapter.elements.map(el => (
                    <ElementCard key={el.id} el={el}
                      expanded={expandedEl === el.id}
                      onToggle={() => setExpandedEl(prev => (prev === el.id ? null : el.id))}
                      onDelete={() => removeElement(activeChapter.id, el)}
                      onChange={p => patchElement(activeChapter.id, el.id, p)} />
                  ))}
                  {activeChapter.elements.length === 0 && (
                    <div className="text-[13px] text-[#8A93A0] px-1 py-2">Noch keine Elemente in diesem Kapitel.</div>
                  )}

                  {/* Add element */}
                  <div className="relative">
                    <button onClick={() => setAddMenuOpen(o => !o)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-[#C3C9D1] text-[13px] text-[#5A6472] hover:border-[#00C8C1] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-all">
                      <Plus size={16} /> Element hinzufügen
                    </button>
                    {addMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setAddMenuOpen(false)} />
                        <div className="absolute z-20 bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 bg-white rounded-lg border border-[#C3C9D1] shadow-xl py-1">
                          {ELEMENT_TYPES.map(({ type, label, Icon }) => (
                            <button key={type} onClick={() => addElement(activeChapter.id, type)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-[#3A424E] hover:bg-[#E6FAF9] hover:text-[#007D78] transition-colors">
                              <Icon size={14} className="text-[#8A93A0]" /> {label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-[13px] text-[#8A93A0]">
                Legen Sie links ein Kapitel an, um Inhalte hinzuzufügen.
              </div>
            )}
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
                {markets && markets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {markets.map(m => (
                      <button key={m.id} title={m.name}
                        onClick={() => setSelectedMarketIds(s => (s.includes(m.id) ? s.filter(x => x !== m.id) : [...s, m.id]))}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${selectedMarketIds.includes(m.id) ? "bg-[#E6FAF9] border-[#00C8C1] text-[#007D78]" : "bg-white border-[#C3C9D1] text-[#5A6472] hover:border-[#8A93A0]"}`}>
                        {m.code}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[#8A93A0]">Keine Märkte hinterlegt.</p>
                )}
              </div>

              {/* Validation */}
              <div>
                <label className="block text-[13px] font-semibold text-[#3A424E] mb-2">Prüfliste</label>
                <div className="space-y-2">
                  {checklist.map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg ${item.ok ? "bg-[#EAF8F0] text-[#15803D]" : "bg-[#FDF3E4] text-[#B45309]"}`}>
                      {item.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Consequence */}
              <div className="bg-[#EBF1FE] rounded-lg px-4 py-3 text-[13px] text-[#1D5BD6]">
                {targetLangs.length > 0 ? (
                  <>Wird in <strong>{targetLangs.length} Sprachen</strong> übersetzt ({targetLangs.join(", ")}).</>
                ) : (
                  <>Keine Zielsprachen – bitte Märkte auswählen.</>
                )}
              </div>

              {publishing && (
                <div>
                  <div className="text-[13px] font-semibold text-[#3A424E] mb-2">Wird veröffentlicht …</div>
                  <ProgressBar percent={100} className="mb-1" />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#E1E5EA]">
              <button onClick={doPublish}
                disabled={publishing || selectedMarketIds.length === 0 || checklist.slice(0, 2).some(item => !item.ok)}
                className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all"
                style={{
                  backgroundColor: publishing ? "#00B3AC" : "#00C8C1",
                  color: "#232830",
                  opacity: selectedMarketIds.length === 0 || checklist.slice(0, 2).some(item => !item.ok) ? 0.5 : 1,
                }}>
                {publishing ? <><span className="w-4 h-4 border-2 border-[#232830]/30 border-t-[#232830] rounded-full animate-spin" /> Wird veröffentlicht …</> : "Jetzt veröffentlichen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Demo-Ansicht ─────────────────────────────────────────────────────────────
// Unveränderte, schreibgeschützte Mockup-Ansicht für den Fall, dass keine
// Datenbank verbunden ist (Supabase = null) oder das Training nicht geladen wurde.

function DemoEditor({ onNavigate }: { onNavigate: NavHandler }) {
  const [saved] = useState("14:32");
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
        {/* Diese Ansicht erscheint, wenn KEIN Training geladen ist – also ohne
            ID in der URL oder bei einem unbekannten Datensatz. Der frühere Text
            behauptete, die Datenbank sei nicht verbunden; das führte in die
            Irre, denn der häufigste Fall ist schlicht „nichts ausgewählt". */}
        <div className="bg-[#FDF3E4] text-[#B45309] text-[12px] px-6 py-1.5 border-b border-[#F5E3C6] shrink-0">
          Beispielansicht – es ist kein Training ausgewählt. Zum Bearbeiten
          eines echten Trainings über <strong>Redaktion → Inhaltsbaum</strong>
          {" "}gehen und dort ein Training öffnen oder neu anlegen.
        </div>

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
