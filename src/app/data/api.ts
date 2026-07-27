import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { updateKeycloakUser } from "./adminUserApi";
import { KEYCLOAK_MODE } from "./keycloakAuth";

// ─── Datenschicht ─────────────────────────────────────────────────────────────
// Lädt Inhalte aus Supabase (nur veröffentlichte Trainings, RLS-gesichert).
// Eingebaute Beispieldaten dürfen ausschließlich im expliziten Demo-Build
// verwendet werden; Produktionsseiten zeigen andernfalls einen Leer-/Fehlerzustand.

export type CatalogModule = { name: string; code: string; count: number; done: number };
export type TrainingCard = { title: string; duration: string; progress: number; isNew: boolean };
export type DashboardTraining = { title: string; module: string; progress: number; status: string };
export type FreshTraining = { title: string; module: string; duration: string; isNew: boolean };

/** Hook: Demo-Daten werden nur im expliziten Demo-Build verwendet. */
export function useSupabaseData<T>(
  fetcher: () => Promise<T | null>,
  demoFallback: T,
  productionFallback: T,
  demoMode: boolean,
): T {
  const [data, setData] = useState<T>(demoMode ? demoFallback : productionFallback);
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
    .select("slug, title, sort, training(id, chapter(id, progress(completed)))")
    .order("sort");
  if (error || !data?.length) return null;
  return data.map((m: any) => {
    const trainings = m.training ?? [];
    const done = trainings.filter((training: any) => {
      const chapters = training.chapter ?? [];
      return chapters.length > 0 && chapters.every((chapter: any) =>
        (chapter.progress ?? []).some((row: any) => row.completed === true));
    }).length;
    return {
      name: m.title,
      code: moduleCode(m.slug),
      count: trainings.length,
      done,
    };
  });
}

export async function fetchModuleTrainings(moduleSlug: string): Promise<TrainingCard[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("title, published_at, chapter(id, progress(completed)), module!inner(slug)")
    .eq("module.slug", moduleSlug)
    .eq("status", "published");
  if (error || !data?.length) return null;
  return data.map((t: any) => {
    const chapters = t.chapter ?? [];
    const completed = chapters.filter((chapter: any) =>
      (chapter.progress ?? []).some((row: any) => row.completed === true)).length;
    return {
      title: t.title,
      duration: estimateDuration(chapters.length || 1),
      progress: chapters.length ? Math.round((completed / chapters.length) * 100) : 0,
      isNew: isNewTraining(t.published_at),
    };
  });
}

// ─── Lernansicht ──────────────────────────────────────────────────────────────

/**
 * `assetId` verweist auf eine hinterlegte Datei (R-03). Der Verweis allein
 * gibt noch nichts preis: Die Abrufadresse holt die Lernansicht einzeln über
 * `/api/media/url`, und die ist wenige Minuten gültig. Fehlt der Verweis, hat
 * die Redaktion für dieses Element noch keine Datei hinterlegt.
 */
export type LearningElement = { id: string; type: string; payload: any; assetId: string | null };
export type LearningChapter = { id: string; title: string; elements: LearningElement[] };
export type LearningTraining = {
  fromDb: boolean;
  id: string;
  title: string;
  chapters: LearningChapter[];
};

/** Übersetzungen als Map: "<ref_type>:<ref_id>:<field>" → { text, status } */
export type TranslationMap = Record<string, { text: string | null; status: string }>;

/**
 * Sucht die freigegebene Datei eines Elements.
 *
 * Nur `ready` zählt. Eine noch nicht geprüfte oder abgelehnte Datei ist eine
 * Redaktionsangelegenheit – Lernenden einen Verweis darauf zu geben, hieße
 * ihnen einen toten Abruf anzubieten.
 */
function readyAssetId(assets: unknown): string | null {
  if (!Array.isArray(assets)) return null;
  const ready = assets.find((a: any) => a?.status === "ready" && typeof a?.id === "string");
  return ready ? (ready as any).id : null;
}

export async function fetchLearningTraining(slug: string): Promise<LearningTraining | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("id, title, chapter(id, title, sort, content_element(id, type, sort, payload, asset(id, status)))")
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
        .map((e: any) => ({
          id: e.id,
          type: e.type,
          payload: e.payload ?? {},
          assetId: readyAssetId(e.asset),
        })),
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
    .select("title, published_at, chapter(id, progress(completed)), module!inner(slug)")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error || !data?.length) return null;
  const rows = data as any[];
  return {
    mine: rows.map(t => {
      const chapters = t.chapter ?? [];
      const completed = chapters.filter((chapter: any) =>
        (chapter.progress ?? []).some((row: any) => row.completed === true)).length;
      const progress = chapters.length ? Math.round((completed / chapters.length) * 100) : 0;
      return {
        title: t.title,
        module: moduleCode(t.module.slug),
        progress,
        status: progress === 100 ? "abgeschlossen" : progress > 0 ? "begonnen" : "offen",
      };
    }),
    fresh: rows.slice(0, 2).map(t => ({
      title: t.title,
      module: moduleCode(t.module.slug),
      duration: estimateDuration(t.chapter?.length ?? 1),
      isNew: true,
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// REDAKTION – Lese- und Schreibfunktionen
// ════════════════════════════════════════════════════════════════════════════

export type UiStatus = "draft" | "published" | "archived" | "outdated" | "missing" | "auto" | "corrected" | "error";

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
  // `training` hat KEINE Spalte `sort` – nur `product`, `module`, `chapter` und
  // `content_element` haben eine. Wurde sie hier mit angefordert, antwortete
  // PostgREST mit `42703 – column training_2.sort does not exist`, die ganze
  // Abfrage schlug fehl und der Inhaltsbaum fiel auf Demo-Daten zurück. Wer
  // dort dann „Neues Training" wählte, hätte es an ein Demo-Modul gehängt,
  // dessen Kennung es in der Datenbank nicht gibt.
  // Sortiert wird deshalb nach Anlagezeitpunkt – im Redaktionsbaum ohnehin
  // aussagekräftiger als alphabetisch. Eine manuelle Reihenfolge braucht eine
  // eigene Spalte; die kommt mit der Drag-&-Drop-Sortierung (P2).
  const { data, error } = await supabase
    .from("product")
    .select("title, sort, module(id, title, sort, training(id, title, status, created_at, chapter(id)))")
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
          .sort((a: any, b: any) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
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

/**
 * In der Redaktion ist auch eine noch nicht freigegebene Datei interessant:
 * Sie erklärt, warum ein Element in der Lernansicht (noch) leer wirkt. Deshalb
 * kommt hier – anders als in der Lernansicht – der Status mit.
 */
export type EditorAsset = {
  id: string; status: "pending" | "ready" | "rejected";
  mime: string; originalName: string | null; sizeBytes: number | null;
};
export type EditorElement = {
  id: string; type: string; sort: number; payload: any; asset: EditorAsset | null;
};
export type EditorChapter = { id: string; title: string; sort: number; elements: EditorElement[] };
export type EditorTraining = {
  id: string; title: string; description: string | null; status: UiStatus;
  moduleTitle: string; productTitle: string; chapters: EditorChapter[];
};

export async function fetchEditorTraining(trainingId: string): Promise<EditorTraining | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("training")
    .select("id, title, description, status, module(title, product(title)), chapter(id, title, sort, content_element(id, type, sort, payload, asset(id, status, mime, original_name, size_bytes)))")
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
          .map((e: any) => ({
            id: e.id, type: e.type, sort: e.sort, payload: e.payload ?? {},
            asset: editorAsset(e.asset),
          })),
      })),
  };
}

/**
 * Nimmt die jüngste Datei eines Elements.
 *
 * Ein eindeutiger Index erlaubt je Element und Sprache nur eine – mehrere
 * kommen also nur zustande, wenn Sprachfassungen im Spiel sind. Für die
 * Redaktionsansicht genügt eine; welche, ist dort nicht entscheidend.
 */
function editorAsset(assets: unknown): EditorAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const a: any = assets.find((x: any) => x?.status === "ready") ?? assets[0];
  if (!a || typeof a.id !== "string") return null;
  return {
    id: a.id,
    status: a.status === "ready" || a.status === "rejected" ? a.status : "pending",
    mime: String(a.mime ?? ""),
    originalName: a.original_name ?? null,
    sizeBytes: typeof a.size_bytes === "number" ? a.size_bytes : null,
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
  return { id: d.id, type: d.type, sort: d.sort, payload: d.payload ?? {}, asset: null };
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
  if (marketIds.length === 0) return false;
  const { data, error } = await supabase.rpc("publish_training", {
    p_training_id: trainingId,
    p_market_ids: [...new Set(marketIds)],
  });
  return !error && data === true;
}

// ─── Zuweisungen: Gruppen und einzelne Benutzer (R-02) ───────────────────────
// Ergänzen die Marktzuweisung, sie ersetzen sie nicht: Ein Lernender sieht ein
// veröffentlichtes Training, sobald EINE der drei Regeln zutrifft (Migration
// 0009). Eine Zuweisung erteilt eine Berechtigung – sie entzieht keine.

export type UserGroup = { id: string; name: string; description: string | null; memberCount: number };
export type GroupMember = { userId: string; name: string; email: string | null };

export async function fetchGroups(): Promise<UserGroup[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_group")
    .select("id, name, description, group_member(user_id)")
    .order("name");
  if (error || !data) return null;
  return (data as any[]).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    memberCount: (g.group_member ?? []).length,
  }));
}

export async function createGroup(name: string, description: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_group")
    .insert({ name: name.trim(), description: description.trim() || null })
    .select("id")
    .single();
  return error || !data ? null : (data as any).id;
}

export async function renameGroup(groupId: string, name: string, description: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("user_group")
    .update({ name: name.trim(), description: description.trim() || null })
    .eq("id", groupId);
  return !error;
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  if (!supabase) return false;
  // Mitgliedschaften und Zuweisungen hängen per ON DELETE CASCADE daran.
  const { error } = await supabase.from("user_group").delete().eq("id", groupId);
  return !error;
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("group_member")
    .select("user_id, app_user(name, email)")
    .eq("group_id", groupId);
  if (error || !data) return null;
  return (data as any[]).map(m => ({
    userId: m.user_id,
    name: m.app_user?.name ?? "—",
    email: m.app_user?.email ?? null,
  }));
}

/** Setzt die Mitglieder einer Gruppe auf genau diese Liste. */
export async function setGroupMembers(groupId: string, userIds: string[]): Promise<boolean> {
  if (!supabase) return false;
  const wanted = [...new Set(userIds)];
  const { error: delErr } = await supabase.from("group_member").delete().eq("group_id", groupId);
  if (delErr) return false;
  if (wanted.length === 0) return true;
  const { error } = await supabase
    .from("group_member")
    .insert(wanted.map(user_id => ({ group_id: groupId, user_id })));
  return !error;
}

export type TrainingAssignment = { groupIds: string[]; userIds: string[] };

export async function fetchTrainingAssignment(trainingId: string): Promise<TrainingAssignment> {
  if (!supabase) return { groupIds: [], userIds: [] };
  const [groups, users] = await Promise.all([
    supabase.from("training_group").select("group_id").eq("training_id", trainingId),
    supabase.from("training_user").select("user_id").eq("training_id", trainingId),
  ]);
  return {
    groupIds: ((groups.data as any[]) ?? []).map(r => r.group_id),
    userIds: ((users.data as any[]) ?? []).map(r => r.user_id),
  };
}

/**
 * Setzt Gruppen- und Einzelzuweisungen eines Trainings auf genau diese Listen.
 *
 * Über eine Datenbankfunktion, nicht über mehrere Einzelaufrufe: Löschen und
 * Neuschreiben müssen zusammen gelingen oder zusammen ausbleiben. Eine frühere
 * Fassung löschte erst und schrieb dann – brach das Schreiben ab, stand das
 * Training ohne jede Zuweisung da und verschwand stillschweigend aus den
 * Katalogen aller Lernenden, die es über ihre Gruppe gesehen hatten.
 */
export async function setTrainingAssignment(
  trainingId: string,
  groupIds: string[],
  userIds: string[],
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("set_training_assignment", {
    p_training_id: trainingId,
    p_group_ids: [...new Set(groupIds)],
    p_user_ids: [...new Set(userIds)],
  });
  return !error;
}

export async function archiveTraining(trainingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("training")
    .update({ status: "archived", published_at: null, updated_at: new Date().toISOString() })
    .eq("id", trainingId);
  return !error;
}

export async function fetchCompletedChapterIds(chapterIds: string[]): Promise<string[] | null> {
  if (!supabase || chapterIds.length === 0) return null;
  const { data, error } = await supabase
    .from("progress")
    .select("chapter_id")
    .eq("completed", true)
    .in("chapter_id", chapterIds);
  if (error || !data) return null;
  return (data as any[]).map((row) => row.chapter_id);
}

export async function completeChapter(chapterId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("complete_chapter", { p_chapter_id: chapterId });
  return !error && data === true;
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

// ════════════════════════════════════════════════════════════════════════════
// VERWALTUNG – Benutzer, Märkte, Sprachen, Einstellungen
// ════════════════════════════════════════════════════════════════════════════

export type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  markets: string[];      // Marktcodes
  marketIds: string[];
  active: boolean;
  lastActive: string | null;
  externalId: string | null;
};

export async function fetchUsers(): Promise<AdminUser[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_user")
    .select("id, subject, name, email, active, last_active_at, user_role_assignment(role), user_market(market_id, market(code))")
    .order("name");
  if (error || !data) return null;
  return (data as any[]).map(u => ({
    id: u.id,
    name: u.name ?? "—",
    email: u.email,
    roles: (u.user_role_assignment ?? []).map((r: any) => r.role),
    markets: (u.user_market ?? []).map((m: any) => m.market?.code).filter(Boolean),
    marketIds: (u.user_market ?? []).map((m: any) => m.market_id),
    active: u.active !== false,
    lastActive: u.last_active_at,
    externalId: u.subject ?? null,
  }));
}

export async function createUser(input: {
  name: string; email: string; roles: string[]; marketIds: string[]; uiLanguage?: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "Keine Datenbankverbindung" };
  const { data, error } = await supabase.from("app_user")
    .insert({ name: input.name, email: input.email || null, ui_language: input.uiLanguage ?? "de" })
    .select("id").single();
  if (error || !data) return { ok: false, message: error?.message ?? "Benutzer konnte nicht angelegt werden" };
  const id = (data as any).id;
  if (input.roles.length) {
    await supabase.from("user_role_assignment").insert(input.roles.map(role => ({ user_id: id, role })));
  }
  if (input.marketIds.length) {
    await supabase.from("user_market").insert(input.marketIds.map(market_id => ({ user_id: id, market_id })));
  }
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean, externalId?: string | null): Promise<boolean> {
  if (!supabase) return false;
  if (KEYCLOAK_MODE && !externalId) return false;
  if (externalId && !(await updateKeycloakUser({ operation: "active", userId: externalId, active }))) return false;
  const { error } = await supabase.from("app_user").update({ active }).eq("id", userId);
  return !error;
}

export async function setUserRoles(userId: string, roles: string[], externalId?: string | null): Promise<boolean> {
  if (!supabase) return false;
  if (KEYCLOAK_MODE && !externalId) return false;
  if (externalId && !(await updateKeycloakUser({ operation: "roles", userId: externalId, roles }))) return false;
  await supabase.from("user_role_assignment").delete().eq("user_id", userId);
  if (!roles.length) return true;
  const { error } = await supabase.from("user_role_assignment")
    .insert(roles.map(role => ({ user_id: userId, role })));
  return !error;
}

export async function setUserMarkets(
  userId: string, marketIds: string[], marketCodes: string[], externalId?: string | null,
): Promise<boolean> {
  if (!supabase) return false;
  if (KEYCLOAK_MODE && !externalId) return false;
  if (externalId && !(await updateKeycloakUser({ operation: "markets", userId: externalId, markets: marketCodes }))) return false;
  await supabase.from("user_market").delete().eq("user_id", userId);
  if (!marketIds.length) return true;
  const { error } = await supabase.from("user_market")
    .insert(marketIds.map(market_id => ({ user_id: userId, market_id })));
  return !error;
}

export async function deleteUser(userId: string, externalId?: string | null): Promise<boolean> {
  if (!supabase) return false;
  if (KEYCLOAK_MODE && !externalId) return false;
  if (externalId && !(await updateKeycloakUser({ operation: "delete", userId: externalId }))) return false;
  const { error } = await supabase.from("app_user").delete().eq("id", userId);
  return !error;
}

// ─── Märkte & Sprachen ───────────────────────────────────────────────────────

export type AdminMarket = {
  id: string; code: string; name: string;
  languages: string[]; defaultLanguage: string | null; trainings: number;
};

export async function fetchAdminMarkets(): Promise<AdminMarket[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("market")
    .select("id, code, name, market_language(language_code, is_default), training_market(training_id)")
    .order("code");
  if (error || !data) return null;
  return (data as any[]).map(m => ({
    id: m.id, code: m.code, name: m.name,
    languages: (m.market_language ?? []).map((l: any) => l.language_code),
    defaultLanguage: (m.market_language ?? []).find((l: any) => l.is_default)?.language_code ?? null,
    trainings: (m.training_market ?? []).length,
  }));
}

export async function fetchLanguages(): Promise<{ code: string; name: string }[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("language").select("code, name").order("name");
  if (error || !data) return null;
  return data as any[];
}

export async function createMarket(input: {
  code: string; name: string; languages: string[]; defaultLanguage: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "Keine Datenbankverbindung" };
  const { data, error } = await supabase.from("market")
    .insert({ code: input.code.toUpperCase(), name: input.name }).select("id").single();
  if (error || !data) return { ok: false, message: error?.message ?? "Markt konnte nicht angelegt werden" };
  const id = (data as any).id;
  const rows = input.languages.map(language_code => ({
    market_id: id, language_code, is_default: language_code === input.defaultLanguage,
  }));
  if (rows.length) {
    const { error: lErr } = await supabase.from("market_language").insert(rows);
    if (lErr) return { ok: false, message: lErr.message };
  }
  return { ok: true };
}

export async function updateMarketLanguages(
  marketId: string, languages: string[], defaultLanguage: string,
): Promise<boolean> {
  if (!supabase) return false;
  await supabase.from("market_language").delete().eq("market_id", marketId);
  if (!languages.length) return true;
  const { error } = await supabase.from("market_language").insert(
    languages.map(language_code => ({
      market_id: marketId, language_code, is_default: language_code === defaultLanguage,
    })),
  );
  return !error;
}

export async function updateMarketName(marketId: string, name: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("market").update({ name }).eq("id", marketId);
  return !error;
}

export async function deleteMarket(marketId: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "Keine Datenbankverbindung" };
  const { error } = await supabase.from("market").delete().eq("id", marketId);
  if (error) return { ok: false, message: "Markt ist noch zugeordnet und kann nicht gelöscht werden." };
  return { ok: true };
}

// ─── Anwendungseinstellungen (nicht-geheim, app_setting) ─────────────────────

export async function fetchAppSettings(): Promise<Record<string, any> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("app_setting").select("key, value");
  if (error || !data) return null;
  const out: Record<string, any> = {};
  for (const r of data as any[]) out[r.key] = r.value;
  return out;
}

export async function saveAppSetting(key: string, value: any): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("app_setting")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return !error;
}

// ════════════════════════════════════════════════════════════════════════════
// REPORTING – ausschließlich aggregiert (kein personenbezogenes Lern-Reporting)
// ════════════════════════════════════════════════════════════════════════════

export type ContentHealthRow = {
  product: string; module: string;
  trainings_total: number; trainings_published: number; trainings_draft: number; chapters_total: number;
};
export type TranslationHealthRow = {
  language_code: string; language_name: string;
  fields_total: number; fields_current: number; fields_outdated: number; fields_error: number; fields_missing: number;
};
export type MarketCoverageRow = {
  market_code: string; market_name: string; trainings_assigned: number; languages: number; users: number;
};
export type ActivityRow = {
  active_learners: number; chapters_completed: number; completed_last_7d: number; completed_last_30d: number;
};

export async function fetchContentHealth(): Promise<ContentHealthRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("report_content_health").select("*");
  if (error || !data) return null;
  return data as any[];
}

export async function fetchTranslationHealth(): Promise<TranslationHealthRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("report_translation_health").select("*");
  if (error || !data) return null;
  return data as any[];
}

export async function fetchMarketCoverage(): Promise<MarketCoverageRow[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("report_market_coverage_secure");
  if (error || !data) return null;
  return data as any[];
}

export async function fetchLearningActivity(): Promise<ActivityRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("report_learning_activity_secure").maybeSingle();
  if (error || !data) return null;
  return data as any;
}

// ─── Suche (Trainings, für die Topbar) ───────────────────────────────────────

export type SearchHit = { slug: string; title: string; module: string | null };

export async function searchTrainings(query: string): Promise<SearchHit[] | null> {
  if (!supabase || query.length < 2) return null;
  const { data, error } = await supabase
    .from("training")
    .select("slug, title, module(title)")
    .eq("status", "published")
    .ilike("title", `%${query}%`)
    .limit(8);
  if (error || !data) return null;
  return (data as any[]).map(t => ({ slug: t.slug, title: t.title, module: t.module?.title ?? null }));
}
