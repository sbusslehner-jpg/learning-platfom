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
