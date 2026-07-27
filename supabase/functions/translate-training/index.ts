// ============================================================
// Übersetzungs-Worker (Konzept §5)
// Supabase Edge Function: sammelt alle übersetzbaren Felder eines
// Trainings ein, übersetzt nur Geändertes (Hash-Delta) über die
// Mistral API und schreibt Ergebnisse mit Status zurück.
//
// Schutzregeln:
//  - Felder mit Status "edited" (korrigiert/gesperrt) werden NIE
//    überschrieben; ändert sich ihr Quelltext, werden sie "outdated".
//  - Der Mistral-Key liegt ausschließlich in den Supabase-Secrets.
//
// Aufruf:  POST { "training_slug": "..." }  oder  { "training_id": "..." }
//          optional: { "languages": ["fr", "pl"] }
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MISTRAL_MODEL = "mistral-small-latest";
const ALLOWED_MISTRAL_MODELS = new Set([
  "mistral-large-latest", "mistral-medium-latest", "mistral-small-latest",
]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Glossar: Fachbegriffe, die nie übersetzt werden (Konzept §5)
const GLOSSARY = [
  "ServiceQ", "DSR", "RPD", "RPC", "CCD", "CCC", "Dealer_Admin",
  "DealerData", "Online Check-In", "GroupIT", "CDM", "DMS",
];

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German", en: "English", fr: "French", pl: "Polish", it: "Italian",
  es: "Spanish", nl: "Dutch", cs: "Czech", pt: "Portuguese", el: "Greek",
  hu: "Hungarian", sv: "Swedish",
};

type Field = { ref_type: string; ref_id: string; field: string; text: string };

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function collectFields(training: any, chapters: any[]): Field[] {
  const fields: Field[] = [];
  const add = (ref_type: string, ref_id: string, field: string, text: unknown) => {
    if (typeof text === "string" && text.trim()) fields.push({ ref_type, ref_id, field, text });
  };
  add("training", training.id, "title", training.title);
  add("training", training.id, "description", training.description);
  for (const c of chapters) {
    add("chapter", c.id, "title", c.title);
    for (const e of c.content_element ?? []) {
      const p = e.payload ?? {};
      switch (e.type) {
        case "text": add("content_element", e.id, "body", p.body); break;
        case "steps":
          add("content_element", e.id, "title", p.title);
          (p.steps ?? []).forEach((s: any, i: number) =>
            add("content_element", e.id, `steps.${i}.text`, s?.text));
          break;
        case "video":
          add("content_element", e.id, "title", p.title);
          add("content_element", e.id, "description", p.description);
          break;
        case "image": add("content_element", e.id, "caption", p.caption); break;
        case "document":
        case "link": add("content_element", e.id, "label", p.label); break;
      }
    }
  }
  return fields;
}

async function translate(
  text: string,
  targetLang: string,
  apiKey: string,
  model: string,
  glossaryEnabled: boolean,
): Promise<string> {
  const target = LANGUAGE_NAMES[targetLang] ?? targetLang;
  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            `You translate training content for automotive after-sales service staff from German to ${target}. ` +
            (glossaryEnabled ? `Rules: keep these terms untranslated: ${GLOSSARY.join(", ")}. ` : "Rules: ") +
            `Preserve any HTML tags exactly. Use formal address (Sie-Form equivalent). ` +
            `Factual, concise tone. Reply with ONLY the translation, no explanations.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mistral ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const out = json?.choices?.[0]?.message?.content;
  if (typeof out !== "string" || !out.trim()) throw new Error("Mistral: leere Antwort");
  return out.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return response(405, { error: "POST erwartet" });
  }

  // Die Funktion arbeitet später mit service_role und muss deshalb die Rolle
  // des Aufrufers VORHER mit dessen JWT gegen PostgREST/RLS prüfen.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/.test(authorization)) {
    return response(401, { error: "Anmeldung erforderlich" });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: "Supabase-Secrets sind unvollständig" });
  }
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isEditor, error: roleError } = await callerClient.rpc("auth_is_editor");
  if (roleError || isEditor !== true) {
    return response(403, { error: "Editor-Berechtigung erforderlich" });
  }

  const mistralKey = Deno.env.get("MISTRAL_API_KEY");
  if (!mistralKey) {
    return response(500, { error: "Secret MISTRAL_API_KEY ist nicht gesetzt" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: settingRows } = await supabase
    .from("app_setting")
    .select("key, value")
    .in("key", ["translation.model", "translation.glossary_enabled"]);
  const settings = new Map((settingRows ?? []).map((row: any) => [row.key, row.value]));
  const configuredModel = settings.get("translation.model");
  const model = typeof configuredModel === "string" && ALLOWED_MISTRAL_MODELS.has(configuredModel)
    ? configuredModel
    : DEFAULT_MISTRAL_MODEL;
  const glossaryEnabled = settings.get("translation.glossary_enabled") !== false;

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response(400, { error: "JSON-Objekt erwartet" });
  }
  if (body.training_id !== undefined && (
    typeof body.training_id !== "string" || !UUID_PATTERN.test(body.training_id)
  )) {
    return response(400, { error: "training_id ist ungültig" });
  }
  if (body.training_slug !== undefined && (
    typeof body.training_slug !== "string" || body.training_slug.length > 120
  )) {
    return response(400, { error: "training_slug ist ungültig" });
  }
  if (!body.training_id && !body.training_slug) {
    return response(400, { error: "training_id oder training_slug ist erforderlich" });
  }
  const requestedLanguages = body.languages === undefined
    ? null
    : Array.isArray(body.languages)
      ? [...new Set(body.languages)]
      : [];
  if (
    requestedLanguages !== null &&
    (requestedLanguages.length === 0 || requestedLanguages.length > 30 ||
      requestedLanguages.some((l) => typeof l !== "string" || !LANGUAGE_PATTERN.test(l)))
  ) {
    return response(400, { error: "languages ist ungültig" });
  }

  // Training laden (per Slug oder ID)
  let query = supabase
    .from("training")
    .select("id, title, description, master_language, chapter(id, title, content_element(id, type, payload))");
  query = body.training_id ? query.eq("id", body.training_id) : query.eq("slug", body.training_slug ?? "");
  const { data: training, error: tErr } = await query.single();
  if (tErr || !training) {
    return response(404, { error: "Training nicht gefunden" });
  }

  // Zielsprachen stammen verbindlich aus den zugeordneten Märkten. Ein Client
  // darf nur eine Teilmenge anfordern, nie beliebige Sprachen und Kosten.
  const { data: langs } = await supabase
    .from("training_market")
    .select("market:market_id(market_language(language_code))")
    .eq("training_id", training.id);
  const assignedLanguages = [...new Set(
    (langs ?? []).flatMap((r: any) => r.market?.market_language ?? []).map((l: any) => l.language_code),
  )].filter((l): l is string => typeof l === "string" && l !== training.master_language);
  if (requestedLanguages?.some((l) => !assignedLanguages.includes(l))) {
    return response(400, { error: "Angeforderte Sprache ist dem Training nicht zugeordnet" });
  }
  const languages = requestedLanguages ?? assignedLanguages;
  if (!languages.length) {
    return response(400, { error: "Keine Zielsprachen (Marktzuordnung prüfen)" });
  }

  const fields = collectFields(training, training.chapter ?? []);
  const refIds = [...new Set(fields.map(f => f.ref_id))];

  const { data: existingRows } = await supabase
    .from("translation")
    .select("ref_type, ref_id, field, language_code, status, source_hash")
    .in("ref_id", refIds)
    .in("language_code", languages);
  const existing = new Map(
    (existingRows ?? []).map((r: any) => [`${r.ref_type}:${r.ref_id}:${r.field}:${r.language_code}`, r]),
  );

  const summary: Record<string, any> = {};

  for (const lang of languages) {
    const { data: job } = await supabase
      .from("translation_job")
      .insert({ training_id: training.id, language_code: lang, status: "running", started_at: new Date().toISOString() })
      .select("id")
      .single();

    const counters = { translated: 0, skipped: 0, locked: 0, marked_outdated: 0, errors: 0 };
    const errorLog: any[] = [];

    for (const f of fields) {
      const hash = await sha256(f.text);
      const prev = existing.get(`${f.ref_type}:${f.ref_id}:${f.field}:${lang}`);

      // Schutzregel: korrigierte Felder nie überschreiben
      if (prev?.status === "edited") {
        if (prev.source_hash !== hash) {
          await supabase.from("translation")
            .update({ status: "outdated", source_hash: hash, updated_at: new Date().toISOString() })
            .match({ ref_type: f.ref_type, ref_id: f.ref_id, field: f.field, language_code: lang });
          counters.marked_outdated++;
        } else {
          counters.locked++;
        }
        continue;
      }

      // Delta-Erkennung: unverändert und bereits automatisch übersetzt → überspringen
      if (prev && prev.source_hash === hash && prev.status === "auto") {
        counters.skipped++;
        continue;
      }

      try {
        const translated = await translate(f.text, lang, mistralKey, model, glossaryEnabled);
        await supabase.from("translation").upsert({
          ref_type: f.ref_type, ref_id: f.ref_id, field: f.field, language_code: lang,
          text: translated, status: "auto", source_hash: hash, updated_at: new Date().toISOString(),
        }, { onConflict: "ref_type,ref_id,field,language_code" });
        counters.translated++;
      } catch (err) {
        await supabase.from("translation").upsert({
          ref_type: f.ref_type, ref_id: f.ref_id, field: f.field, language_code: lang,
          status: "error", source_hash: hash, updated_at: new Date().toISOString(),
        }, { onConflict: "ref_type,ref_id,field,language_code" });
        counters.errors++;
        errorLog.push({ field: `${f.ref_type}:${f.ref_id}:${f.field}`, message: String(err).slice(0, 500) });
      }
    }

    if (job) {
      await supabase.from("translation_job").update({
        status: counters.errors ? "failed" : "done",
        finished_at: new Date().toISOString(),
        error_log: errorLog,
      }).eq("id", job.id);
    }
    summary[lang] = counters;
  }

  return response(200, { training: training.title, fields: fields.length, languages: summary });
});
