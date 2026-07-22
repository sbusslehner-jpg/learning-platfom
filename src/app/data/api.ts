import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// ─── Datenschicht ─────────────────────────────────────────────────────────────
// Lädt Inhalte aus Supabase (nur veröffentlichte Trainings, RLS-gesichert).
// Ist Supabase nicht konfiguriert oder ein Aufruf schlägt fehl, behalten die
// Seiten ihre eingebauten Demo-Daten – die Oberfläche bricht nie.

export type CatalogModule = { name: string; code: string; count: number; done: number };
export type TrainingCard = { title: string; duration: string; progress: number; isNew: boolean };
export type DashboardTraining = { title: string; module: string; progress: number; status: string };
export type FreshTraining = { title: string; module: string; duration: string; isNew: boolean };

/** Hook: liefert `fallback`, bis der Fetcher echte Daten geliefert hat. */
export function useSupabaseData<T>(fetcher: () => Promise<T | null>, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    fetcher()
      .then(d => {
        if (alive && d) setData(d);
      })
      .catch(() => {
        /* Fallback behalten */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

const moduleCode = (slug: string) => slug.replace(/-/g, " ").toUpperCase();

// Grobe Dauer-Schätzung, solange Elemente keine Zeitangaben tragen: 12 Min./Kapitel
const estimateDuration = (chapterCount: number) => `${Math.max(10, chapterCount * 12)} Min.`;

const isNewTraining = (publishedAt: string | null) =>
  !!publishedAt && Date.now() - new Date(publishedAt).getTime() < 30 * 24 * 60 * 60 * 1000;

export async function fetchCatalogModules(): Promise<CatalogModule[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("module")
    .select("slug, title, sort, training(id)")
    .order("sort");
  if (error || !data?.length) return null;
  return data.map((m: any) => ({
    name: m.title,
    code: moduleCode(m.slug),
    count: m.training?.length ?? 0,
    done: 0, // Lernfortschritt folgt mit der Auth-Ausbaustufe
  }));
}

export async function fetchModuleTrainings(moduleSlug: string): Promise<TrainingCard[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("title, published_at, chapter(id), module!inner(slug)")
    .eq("module.slug", moduleSlug)
    .eq("status", "published");
  if (error || !data?.length) return null;
  return data.map((t: any) => ({
    title: t.title,
    duration: estimateDuration(t.chapter?.length ?? 1),
    progress: 0,
    isNew: isNewTraining(t.published_at),
  }));
}

// ─── Lernansicht ──────────────────────────────────────────────────────────────

export type LearningElement = { id: string; type: string; payload: any };
export type LearningChapter = { id: string; title: string; elements: LearningElement[] };
export type LearningTraining = {
  fromDb: boolean;
  id: string;
  title: string;
  chapters: LearningChapter[];
};

/** Übersetzungen als Map: "<ref_type>:<ref_id>:<field>" → { text, status } */
export type TranslationMap = Record<string, { text: string | null; status: string }>;

export async function fetchLearningTraining(slug: string): Promise<LearningTraining | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("id, title, chapter(id, title, sort, content_element(id, type, sort, payload))")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  if (error || !data) return null;
  const chapters = ((data as any).chapter ?? [])
    .sort((a: any, b: any) => a.sort - b.sort)
    .map((c: any) => ({
      id: c.id,
      title: c.title,
      elements: (c.content_element ?? [])
        .sort((a: any, b: any) => a.sort - b.sort)
        .map((e: any) => ({ id: e.id, type: e.type, payload: e.payload ?? {} })),
    }));
  if (!chapters.length) return null;
  return { fromDb: true, id: (data as any).id, title: (data as any).title, chapters };
}

export async function fetchTranslationMap(
  refIds: string[],
  language: string,
): Promise<TranslationMap | null> {
  if (!supabase || !refIds.length) return null;
  const { data, error } = await supabase
    .from("translation")
    .select("ref_type, ref_id, field, text, status")
    .eq("language_code", language)
    .in("ref_id", refIds);
  if (error || !data) return null;
  const map: TranslationMap = {};
  for (const t of data as any[]) {
    map[`${t.ref_type}:${t.ref_id}:${t.field}`] = { text: t.text, status: t.status };
  }
  return map;
}

export async function fetchDashboardLists(): Promise<{
  mine: DashboardTraining[];
  fresh: FreshTraining[];
} | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("title, published_at, chapter(id), module!inner(slug)")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error || !data?.length) return null;
  const rows = data as any[];
  return {
    mine: rows.map(t => ({
      title: t.title,
      module: moduleCode(t.module.slug),
      progress: 0,
      status: "offen",
    })),
    fresh: rows.slice(0, 2).map(t => ({
      title: t.title,
      module: moduleCode(t.module.slug),
      duration: estimateDuration(t.chapter?.length ?? 1),
      isNew: true,
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// REDAKTION – Lese- und Schreibfunktionen (Demo: anon-Schreibzugriff, s. 0002)
// ════════════════════════════════════════════════════════════════════════════

export type UiStatus = "draft" | "published" | "outdated" | "missing" | "auto" | "corrected" | "error";

// DB-Status ⇄ UI-Status (die Automatik nennt korrigierte Felder "edited")
const dbToUiTranslationStatus = (s: string): UiStatus =>
  s === "edited" ? "corrected" : (s as UiStatus);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "training";
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Inhaltsbaum (Produkt → Modul → Training, alle Status) ───────────────────

export type TreeTraining = { id: string; title: string; status: UiStatus; chapters: number };
export type TreeModule = { id: string; name: string; trainings: TreeTraining[] };
export type TreeProduct = { product: string; modules: TreeModule[] };

export async function fetchContentTree(): Promise<TreeProduct[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("product")
    .select("title, sort, module(id, title, sort, training(id, title, status, sort, chapter(id)))")
    .order("sort");
  if (error || !data?.length) return null;
  return (data as any[]).map(p => ({
    product: p.title,
    modules: (p.module ?? [])
      .sort((a: any, b: any) => a.sort - b.sort)
      .map((m: any) => ({
        id: m.id,
        name: m.title,
        trainings: (m.training ?? [])
          .sort((a: any, b: any) => a.sort - b.sort)
          .map((t: any) => ({
            id: t.id,
            title: t.title,
            status: (t.status as UiStatus) ?? "draft",
            chapters: t.chapter?.length ?? 0,
          })),
      })),
  }));
}

export async function createTraining(moduleId: string, title: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .insert({ module_id: moduleId, slug: `${slugify(title)}-${Date.now().toString(36)}`, title, status: "draft" })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as any).id;
}

// ─── Trainingseditor (ein Training mit Kapiteln und Elementen) ───────────────

export type EditorElement = { id: string; type: string; sort: number; payload: any };
export type EditorChapter = { id: string; title: string; sort: number; elements: EditorElement[] };
export type EditorTraining = {
  id: string; title: string; description: string | null; status: UiStatus;
  moduleTitle: string; productTitle: string; chapters: EditorChapter[];
};

export async function fetchEditorTraining(trainingId: string): Promise<EditorTraining | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("id, title, description, status, module(title, product(title)), chapter(id, title, sort, content_element(id, type, sort, payload))")
    .eq("id", trainingId)
    .single();
  if (error || !data) return null;
  const d = data as any;
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    status: (d.status as UiStatus) ?? "draft",
    moduleTitle: d.module?.title ?? "",
    productTitle: d.module?.product?.title ?? "ServiceQ",
    chapters: (d.chapter ?? [])
      .sort((a: any, b: any) => a.sort - b.sort)
      .map((c: any) => ({
        id: c.id, title: c.title, sort: c.sort,
        elements: (c.content_element ?? [])
          .sort((a: any, b: any) => a.sort - b.sort)
          .map((e: any) => ({ id: e.id, type: e.type, sort: e.sort, payload: e.payload ?? {} })),
      })),
  };
}

export async function updateTrainingMeta(id: string, patch: { title?: string; description?: string }): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("training")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  return !error;
}

export async function createChapter(trainingId: string, title: string, sort: number): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("chapter")
    .insert({ training_id: trainingId, title, sort }).select("id").single();
  if (error || !data) return null;
  return (data as any).id;
}

export async function updateChapterTitle(id: string, title: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("chapter").update({ title }).eq("id", id);
  return !error;
}

export async function deleteChapter(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("chapter").delete().eq("id", id);
  return !error;
}

const DEFAULT_PAYLOAD: Record<string, any> = {
  text: { body: "<p>Neuer Textabsatz …</p>" },
  steps: { title: "Neue Schrittanleitung", steps: [{ text: "Erster Schritt …" }] },
  video: { title: "Neues Video", description: "" },
  image: { caption: "Bildunterschrift …" },
  document: { label: "Dokument" },
  link: { label: "Link", url: "https://" },
};

export async function createElement(chapterId: string, type: string, sort: number): Promise<EditorElement | null> {
  if (!supabase) return null;
  const payload = DEFAULT_PAYLOAD[type] ?? {};
  const { data, error } = await supabase.from("content_element")
    .insert({ chapter_id: chapterId, type, sort, payload }).select("id, type, sort, payload").single();
  if (error || !data) return null;
  const d = data as any;
  return { id: d.id, type: d.type, sort: d.sort, payload: d.payload ?? {} };
}

export async function updateElementPayload(id: string, payload: any): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("content_element").update({ payload }).eq("id", id);
  return !error;
}

export async function deleteElement(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("content_element").delete().eq("id", id);
  return !error;
}

// ─── Märkte & Veröffentlichen ────────────────────────────────────────────────

export type MarketOption = { id: string; code: string; name: string; languages: string[] };

export async function fetchMarkets(): Promise<MarketOption[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("market")
    .select("id, code, name, market_language(language_code)")
    .order("code");
  if (error || !data) return null;
  return (data as any[]).map(m => ({
    id: m.id, code: m.code, name: m.name,
    languages: (m.market_language ?? []).map((l: any) => l.language_code),
  }));
}

export async function fetchTrainingMarketIds(trainingId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("training_market").select("market_id").eq("training_id", trainingId);
  return (data as any[] ?? []).map(r => r.market_id);
}

export async function publishTraining(trainingId: string, marketIds: string[]): Promise<boolean> {
  if (!supabase) return false;
  const { error: uErr } = await supabase.from("training")
    .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", trainingId);
  if (uErr) return false;
  await supabase.from("training_market").delete().eq("training_id", trainingId);
  if (marketIds.length) {
    const rows = marketIds.map(market_id => ({ training_id: trainingId, market_id }));
    const { error: iErr } = await supabase.from("training_market").insert(rows);
    if (iErr) return false;
  }
  return true;
}

/** Stößt den Mistral-Worker an (Edge Function). Erfordert deployten Worker. */
export async function triggerTranslation(trainingId: string, languages?: string[]): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: "Supabase nicht konfiguriert" };
  const { data, error } = await supabase.functions.invoke("translate-training", {
    body: languages?.length ? { training_id: trainingId, languages } : { training_id: trainingId },
  });
  if (error) return { ok: false, message: error.message ?? "Worker nicht erreichbar" };
  return { ok: true, message: typeof data === "object" ? "Übersetzungslauf gestartet" : String(data) };
}

// ─── Übersetzbare Felder (identische Logik wie der Worker) ───────────────────

export type TranslatableField = {
  refType: "training" | "chapter" | "content_element";
  refId: string; field: string; label: string; master: string;
};

function collectTranslatableFields(t: EditorTraining): TranslatableField[] {
  const out: TranslatableField[] = [];
  const push = (refType: TranslatableField["refType"], refId: string, field: string, label: string, master: unknown) => {
    if (typeof master === "string" && master.trim()) out.push({ refType, refId, field, label, master });
  };
  push("training", t.id, "title", "Training · Titel", t.title);
  push("training", t.id, "description", "Training · Beschreibung", t.description ?? "");
  t.chapters.forEach((c, ci) => {
    push("chapter", c.id, "title", `Kap. ${ci + 1} · Titel`, c.title);
    c.elements.forEach((e, ei) => {
      const p = e.payload ?? {};
      const base = `K${ci + 1}.${ei + 1}`;
      switch (e.type) {
        case "text": push("content_element", e.id, "body", `${base} · Text`, p.body); break;
        case "steps":
          push("content_element", e.id, "title", `${base} · Titel`, p.title);
          (p.steps ?? []).forEach((s: any, si: number) =>
            push("content_element", e.id, `steps.${si}.text`, `${base} · Schritt ${si + 1}`, s?.text));
          break;
        case "video":
          push("content_element", e.id, "title", `${base} · Videotitel`, p.title);
          push("content_element", e.id, "description", `${base} · Videobeschr.`, p.description);
          break;
        case "image": push("content_element", e.id, "caption", `${base} · Bildunterschrift`, p.caption); break;
        case "document":
        case "link": push("content_element", e.id, "label", `${base} · Bezeichnung`, p.label); break;
      }
    });
  });
  return out;
}

// ─── Übersetzungs-Übersicht (Aggregat je Training × Sprache) ─────────────────

export type LangHealth = { code: string; name: string; total: number; current: number; outdated: number; errors: number; missing: number };
export type TrainingHealth = { id: string; title: string; module: string; languages: LangHealth[]; urgent: number };

export async function fetchTranslationOverview(): Promise<TrainingHealth[] | null> {
  if (!supabase) return null;
  const { data: langRows } = await supabase.from("language").select("code, name");
  const langName = new Map((langRows as any[] ?? []).map(l => [l.code, l.name]));

  const { data: trainings, error } = await supabase
    .from("training")
    .select("id, title, module(slug), training_market(market(market_language(language_code)))")
    .eq("status", "published");
  if (error || !trainings?.length) return null;

  const result: TrainingHealth[] = [];
  for (const t of trainings as any[]) {
    const targetLangs = [...new Set(
      (t.training_market ?? []).flatMap((tm: any) => tm.market?.market_language ?? []).map((l: any) => l.language_code),
    )].filter(l => l !== "de") as string[];
    if (!targetLangs.length) continue;

    const full = await fetchEditorTraining(t.id);
    if (!full) continue;
    const fields = collectTranslatableFields(full);
    const total = fields.length;
    const refIds = [...new Set(fields.map(f => f.refId))];

    const { data: trans } = await supabase
      .from("translation")
      .select("ref_id, field, language_code, status")
      .in("ref_id", refIds)
      .in("language_code", targetLangs);
    const rows = (trans as any[]) ?? [];

    const languages: LangHealth[] = targetLangs.map(code => {
      const forLang = rows.filter(r => r.language_code === code);
      const present = forLang.length;
      const current = forLang.filter(r => r.status === "auto" || r.status === "edited").length;
      const outdated = forLang.filter(r => r.status === "outdated").length;
      const errors = forLang.filter(r => r.status === "error").length;
      const missing = Math.max(0, total - present);
      return { code, name: langName.get(code) ?? code, total, current, outdated, errors, missing };
    });
    const urgent = languages.filter(l => l.outdated > 0 || l.errors > 0 || l.missing > 0).length;
    result.push({ id: t.id, title: t.title, module: moduleCode(t.module?.slug ?? ""), languages, urgent });
  }
  return result;
}

// ─── Prüfansicht (Master-Feld ↔ Übersetzung) ─────────────────────────────────

export type ReviewField = {
  key: string; refType: string; refId: string; field: string;
  label: string; master: string; translation: string; status: UiStatus;
};
export type ReviewData = { trainingId: string; trainingTitle: string; language: string; languageName: string; fields: ReviewField[] };

export async function fetchReviewFields(trainingId: string, language: string): Promise<ReviewData | null> {
  if (!supabase) return null;
  const full = await fetchEditorTraining(trainingId);
  if (!full) return null;
  const fields = collectTranslatableFields(full);
  const refIds = [...new Set(fields.map(f => f.refId))];

  const { data: trans } = await supabase
    .from("translation")
    .select("ref_type, ref_id, field, text, status")
    .eq("language_code", language)
    .in("ref_id", refIds);
  const map = new Map((trans as any[] ?? []).map(r => [`${r.ref_type}:${r.ref_id}:${r.field}`, r]));

  const { data: langRow } = await supabase.from("language").select("name").eq("code", language).single();

  return {
    trainingId, trainingTitle: full.title, language,
    languageName: (langRow as any)?.name ?? language,
    fields: fields.map(f => {
      const hit = map.get(`${f.refType}:${f.refId}:${f.field}`);
      return {
        key: `${f.refType}:${f.refId}:${f.field}`,
        refType: f.refType, refId: f.refId, field: f.field, label: f.label, master: f.master,
        translation: hit?.text ?? "",
        status: hit ? dbToUiTranslationStatus(hit.status) : "missing",
      };
    }),
  };
}

/** Speichert eine manuelle Korrektur: Status → edited (gesperrt), Hash des Masters. */
export async function saveCorrection(
  refType: string, refId: string, field: string, language: string, master: string, text: string,
): Promise<boolean> {
  if (!supabase) return false;
  const source_hash = await sha256(master);
  const { error } = await supabase.from("translation").upsert({
    ref_type: refType, ref_id: refId, field, language_code: language,
    text, status: "edited", source_hash, updated_at: new Date().toISOString(),
  }, { onConflict: "ref_type,ref_id,field,language_code" });
  return !error;
}

/** Verfügbare Zielsprachen eines Trainings (aus den zugeordneten Märkten). */
export async function fetchTrainingLanguages(trainingId: string): Promise<{ code: string; name: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("training_market")
    .select("market(market_language(language_code))")
    .eq("training_id", trainingId);
  const codes = [...new Set(
    (data as any[] ?? []).flatMap(tm => tm.market?.market_language ?? []).map((l: any) => l.language_code),
  )].filter(c => c !== "de") as string[];
  if (!codes.length) return [];
  const { data: names } = await supabase.from("language").select("code, name").in("code", codes);
  const nameMap = new Map((names as any[] ?? []).map(n => [n.code, n.name]));
  return codes.map(code => ({ code, name: nameMap.get(code) ?? code }));
}
