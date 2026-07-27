#!/usr/bin/env node
// ============================================================
// RLS-Abnahme gegen eine echte Datenbank (R-01).
//
// Statische Prüfung reicht bei Row-Level-Security nicht. Der Beweis dafür ist
// Migration 0011: Die Policies sahen korrekt aus und waren es auch – nur rief
// die Sichtbarkeitsfunktion sich über die Policy der gelesenen Tabelle endlos
// selbst auf. Das sieht man keinem SQL-Text an, sondern nur der Ausführung.
//
// Und selbst die Ausführung zeigt es nur, wenn Zeilen da sind: Eine Policy wird
// nicht ausgewertet, wenn es nichts auszuwerten gibt. Deshalb legt dieses
// Skript eigene Testdaten an, statt sich auf den Bestand zu verlassen.
//
// Alles läuft in EINER Transaktion, die am Ende zurückgerollt wird. Die Probe
// fasst echte Policies an und hinterlässt trotzdem nichts – sie ist auch gegen
// die Produktionsdatenbank gefahrlos.
//
//   DATABASE_URL=… node scripts/db-verify.mjs
// ============================================================

import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

let pg;
try {
  ({ default: pg } = await import("pg"));
} catch {
  console.error("Das Paket `pg` fehlt: npm install --save-dev --legacy-peer-deps pg");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt (Session-Pooler-Verbindung, Port 5432).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 30_000,
  connectionTimeoutMillis: 20_000,
});

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; failures.push(name); console.log(`  FEHL  ${name}${detail ? "  → " + detail : ""}`); }
}

/** Versetzt die Sitzung in die Rolle eines angemeldeten Benutzers. */
async function as(sub, roles, markets = []) {
  await c.query("select set_config('role','authenticated',true)");
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub, academy_roles: roles, markets, tenant: "serviceq", role: "authenticated" }),
  ]);
}
async function asOwner() {
  await c.query("select set_config('role','postgres',true)");
  await c.query("select set_config('request.jwt.claims','',true)");
}

/**
 * Führt eine Abfrage aus, die scheitern DARF.
 *
 * Der Savepoint ist hier kein Beiwerk: Eine abgewiesene Anweisung bricht in
 * Postgres die ganze Transaktion ab, jede folgende liefert dann 25P02. Ohne
 * Savepoint würde die erste erfolgreiche Rechteprüfung den Rest der Abnahme
 * unbrauchbar machen – und zwar mit einem Fehlerbild, das wie ein weiterer
 * Befund aussieht.
 */
async function may(sql, params = []) {
  await c.query("savepoint probe");
  try {
    const rows = (await c.query(sql, params)).rows;
    await c.query("release savepoint probe");
    return { ok: true, rows };
  } catch (error) {
    await c.query("rollback to savepoint probe");
    await c.query("release savepoint probe");
    return { ok: false, error: error.message.split("\n")[0], code: error.code };
  }
}

/** Zählt Zeilen unter der aktuellen Identität; `null`, wenn der Zugriff scheitert. */
async function count(table, where = "", params = []) {
  const r = await may(`select count(*)::int n from ${table} ${where}`, params);
  return r.ok ? r.rows[0].n : null;
}

await c.connect();
await c.query("begin");

try {
  // ─── A. Struktur ──────────────────────────────────────────────────────────
  console.log("\nA. Struktur");

  const rlsTables = ["user_group", "group_member", "training_group", "training_user",
                     "rate_limit", "audit_event", "training", "progress", "app_user",
                     "chapter", "content_element", "asset", "translation"];
  const rls = await c.query(
    `select relname, relrowsecurity from pg_class
      where relname = any($1) and relnamespace = 'public'::regnamespace`, [rlsTables]);
  for (const t of rlsTables) {
    const row = rls.rows.find(r => r.relname === t);
    check(`RLS aktiv auf ${t}`, row?.relrowsecurity === true, row ? "aus" : "Tabelle fehlt");
  }

  // Die beiden Funktionen MÜSSEN `security definer` sein – sonst kehrt die
  // Rekursion aus 0011 zurück, und zwar unbemerkt bis zum ersten Inhalt.
  const sec = await c.query(
    `select proname, prosecdef, proconfig from pg_proc
      where proname in ('auth_can_see_training','auth_in_group')
        and pronamespace = 'public'::regnamespace`);
  for (const f of ["auth_can_see_training", "auth_in_group"]) {
    const row = sec.rows.find(r => r.proname === f);
    check(`${f} ist security definer (Rekursionsschutz)`, row?.prosecdef === true);
    check(`${f} hat festes search_path`,
      Array.isArray(row?.proconfig) && row.proconfig.some(v => v.startsWith("search_path=")));
  }

  for (const f of ["rate_limit_hit", "rate_limit_cleanup", "auth_is_admin", "auth_is_editor", "auth_markets"]) {
    const r = await c.query(
      `select 1 from pg_proc where proname=$1 and pronamespace='public'::regnamespace`, [f]);
    check(`Funktion ${f} vorhanden`, r.rowCount > 0);
  }

  const pol = await c.query(`select tablename, policyname from pg_policies where schemaname='public'`);
  for (const [t, p] of [
    ["user_group", "user_group_select"], ["user_group", "user_group_write"],
    ["group_member", "group_member_select"], ["group_member", "group_member_write"],
    ["training_group", "training_group_select"], ["training_group", "training_group_write"],
    ["training_user", "training_user_select"], ["training_user", "training_user_write"],
    ["audit_event", "audit_event_select"],
  ]) check(`Policy ${t}.${p}`, pol.rows.some(r => r.tablename === t && r.policyname === p));

  // ─── B. Rate-Limit (R-13) ─────────────────────────────────────────────────
  console.log("\nB. Rate-Limit");
  const bucket = "abnahme-" + process.pid;
  const hit = async (limit) => (await c.query("select rate_limit_hit($1,$2,60) v", [bucket, limit])).rows[0].v;
  check("1. Zugriff erlaubt", await hit(2) === true);
  check("2. Zugriff erlaubt", await hit(2) === true);
  check("3. Zugriff abgewiesen", await hit(2) === false);
  check("Limit 0 sperrt nicht versehentlich alles", await hit(0) === true);

  // ─── C. Testdaten ─────────────────────────────────────────────────────────
  console.log("\nC. Testdaten");
  await asOwner();

  const marketId = (await c.query(
    `insert into market (code, name) values ('ZZ','Abnahme-Markt')
     on conflict (code) do update set name = excluded.name returning id`)).rows[0].id;

  const users = {};
  for (const [key, name] of [
    ["lerner", "Abnahme Lerner"], ["fremd", "Abnahme Gruppenmitglied"],
    ["einzel", "Abnahme Einzelzuweisung"], ["editor", "Abnahme Redaktion"],
    ["admin", "Abnahme Verwaltung"],
  ]) {
    users[key] = (await c.query(
      `insert into app_user (email, name, active) values ($1,$2,true) returning id`,
      [`${key}@abnahme.invalid`, name])).rows[0].id;
  }
  await c.query(`insert into user_market (user_id, market_id) values ($1,$2)`, [users.lerner, marketId]);

  const groupId = (await c.query(
    `insert into user_group (name, description) values ('Abnahme-Gruppe','Probe') returning id`)).rows[0].id;
  await c.query(`insert into group_member (group_id, user_id) values ($1,$2)`, [groupId, users.fremd]);

  const productId = (await c.query(
    `insert into product (slug, title) values ('abnahme-produkt','Abnahme-Produkt') returning id`)).rows[0].id;
  const moduleId = (await c.query(
    `insert into module (product_id, slug, title) values ($1,'abnahme-modul','Abnahme-Modul') returning id`,
    [productId])).rows[0].id;

  const tr = {};
  for (const key of ["markt", "gruppe", "person", "entwurf"]) {
    tr[key] = (await c.query(
      `insert into training (module_id, slug, title, status) values ($1,$2,$3,$4) returning id`,
      [moduleId, `abnahme-${key}`, `Abnahme ${key}`, key === "entwurf" ? "draft" : "published"])).rows[0].id;
  }
  await c.query(`insert into training_market (training_id, market_id) values ($1,$2),($3,$2)`,
    [tr.markt, marketId, tr.entwurf]);
  await c.query(`insert into training_group (training_id, group_id) values ($1,$2)`, [tr.gruppe, groupId]);
  await c.query(`insert into training_user (training_id, user_id) values ($1,$2)`, [tr.person, users.einzel]);

  const chapterId = (await c.query(
    `insert into chapter (training_id, title, sort) values ($1,'Abnahme-Kapitel',0) returning id`,
    [tr.markt])).rows[0].id;
  await c.query(`insert into progress (user_id, chapter_id, completed) values ($1,$2,true)`,
    [users.lerner, chapterId]);
  console.log("  (5 Benutzer, 1 Gruppe, 4 Trainings, 1 Kapitel, 1 Fortschritt)");

  // ─── D. Keine Rekursion (Regression zu 0011) ──────────────────────────────
  console.log("\nD. Lesbarkeit für Lernende (Regression 0011)");
  await as(users.lerner, ["user"], ["ZZ"]);
  for (const t of ["training", "training_market", "chapter", "content_element", "asset", "translation"]) {
    const n = await count(t);
    check(`${t} ist für Lernende lesbar`, n !== null,
      "Zugriff scheitert – Verdacht auf Policy-Rekursion (54001)");
  }

  // ─── E. Sichtbarkeit: Markt ODER Gruppe ODER Person (R-02) ────────────────
  console.log("\nE. Sichtbarkeit");
  const sees = async (id) => (await c.query("select auth_can_see_training($1) v", [id])).rows[0].v;

  await as(users.lerner, ["user"], ["ZZ"]);
  check("Lerner sieht das Training seines Marktes", await sees(tr.markt) === true);
  check("Lerner sieht kein Gruppen-Training ohne Mitgliedschaft", await sees(tr.gruppe) === false);
  check("Lerner sieht keinen Entwurf, auch nicht im eigenen Markt", await sees(tr.entwurf) === false);

  await as(users.fremd, ["user"], []);
  check("Gruppenmitglied ohne passenden Markt sieht das Gruppen-Training", await sees(tr.gruppe) === true);
  check("Gruppenmitglied sieht das fremde Markt-Training nicht", await sees(tr.markt) === false);

  await as(users.einzel, ["user"], []);
  check("Einzelzuweisung wirkt ohne Markt und ohne Gruppe", await sees(tr.person) === true);
  check("Einzelzugewiesener sieht fremdes Gruppen-Training nicht", await sees(tr.gruppe) === false);

  await as(users.editor, ["editor"], []);
  check("Redaktion sieht auch Entwürfe", await sees(tr.entwurf) === true);
  await as(users.admin, ["admin"], []);
  check("Verwaltung sieht alles", await sees(tr.gruppe) === true);

  // ─── F. Schreibrechte ─────────────────────────────────────────────────────
  console.log("\nF. Schreibrechte");
  const denied = async (label, sql, params = []) => {
    const r = await may(sql, params);
    check(label, !r.ok, r.ok ? "wurde zugelassen" : "");
  };
  const allowed = async (label, sql, params = []) => {
    const r = await may(sql, params);
    check(label, r.ok, r.ok ? "" : `${r.code} ${r.error}`);
  };

  await as(users.lerner, ["user"], ["ZZ"]);
  await denied("Lerner darf keine Gruppe anlegen",
    `insert into user_group (name) values ('Verboten-Lerner')`);
  await denied("Lerner darf sich kein Training zuweisen",
    `insert into training_user (training_id,user_id) values ($1,$2)`, [tr.gruppe, users.lerner]);
  await denied("Lerner darf kein Training anlegen",
    `insert into training (module_id,slug,title) values ($1,'verboten','Verboten')`, [moduleId]);
  await denied("Lerner darf fremden Fortschritt nicht schreiben",
    `insert into progress (user_id,chapter_id,completed) values ($1,$2,true)`, [users.fremd, chapterId]);

  await as(users.editor, ["editor"], []);
  await allowed("Redaktion darf zuweisen",
    `insert into training_group (training_id,group_id) values ($1,$2)`, [tr.markt, groupId]);
  await denied("Redaktion darf keine Gruppe anlegen (das ist Verwaltung)",
    `insert into user_group (name) values ('Verboten-Redaktion')`);
  await denied("Redaktion darf keine Benutzer anlegen",
    `insert into app_user (email,name) values ('verboten@abnahme.invalid','Verboten')`);

  await as(users.admin, ["admin"], []);
  await allowed("Verwaltung darf Gruppen anlegen",
    `insert into user_group (name) values ('Abnahme-Gruppe-2')`);
  await denied("Verwaltung darf keine Trainings schreiben (Rollentrennung)",
    `insert into training (module_id,slug,title) values ($1,'verboten-admin','Verboten')`, [moduleId]);

  // ─── G. Mitgliedschaften sind personenbezogen ─────────────────────────────
  console.log("\nG. Mitgliedschaften");
  await as(users.lerner, ["user"], ["ZZ"]);
  check("Lerner sieht fremde Mitgliedschaften nicht", await count("group_member") === 0);
  check("Gruppenliste bleibt lesbar (Auswahllisten der Redaktion)", (await count("user_group")) >= 1);
  await as(users.fremd, ["user"], []);
  check("Mitglied sieht die eigene Mitgliedschaft", await count("group_member") === 1);
  await as(users.admin, ["admin"], []);
  check("Verwaltung sieht alle Mitgliedschaften", (await count("group_member")) >= 1);

  // ─── H. Lernfortschritt ───────────────────────────────────────────────────
  console.log("\nH. Lernfortschritt");
  await as(users.lerner, ["user"], ["ZZ"]);
  check("Lerner sieht den eigenen Fortschritt", await count("progress") === 1);
  await as(users.fremd, ["user"], []);
  check("Lerner sieht fremden Fortschritt nicht", await count("progress") === 0);
  await as(users.admin, ["admin"], []);
  const adminSees = await count("progress", "where user_id = $1", [users.lerner]);
  check("Auch die Verwaltung sieht keinen fremden Einzelfortschritt",
    adminSees === 0 || adminSees === null, `sah ${adminSees}`);

  // ─── I. Audit-Trail (R-10) ────────────────────────────────────────────────
  console.log("\nI. Audit-Trail");
  await asOwner();
  await c.query(
    `insert into audit_event (actor_id, actor_label, action, target_type, target_id, outcome)
     values ($1,'abnahme@invalid','probe.write','training',$2,'ok')`, [users.admin, tr.markt]);

  await as(users.lerner, ["user"], ["ZZ"]);
  const asUser = await count("audit_event");
  check("Lerner liest das Protokoll nicht", asUser === 0 || asUser === null, `sah ${asUser}`);
  await as(users.admin, ["admin"], []);
  check("Verwaltung liest das Protokoll", (await count("audit_event")) >= 1);
  await denied("Niemand darf ins Protokoll schreiben",
    `insert into audit_event (actor_label,action) values ('faelschung','probe.forge')`);
  await denied("Protokolleinträge sind nicht änderbar", `update audit_event set action='manipuliert'`);
  await denied("Protokolleinträge sind nicht löschbar", `delete from audit_event`);

  // ─── J. Zähler sind nicht manipulierbar ───────────────────────────────────
  console.log("\nJ. Zähler");
  await denied("Der Zähler ist nicht lesbar", `select count(*) from rate_limit`);
  await denied("Der Zähler ist nicht zurücksetzbar", `delete from rate_limit`);

} catch (error) {
  fail++;
  failures.push("Abbruch: " + error.message.split("\n")[0]);
  console.error("\nABBRUCH:", error.code ?? "", error.message.split("\n")[0]);
} finally {
  await asOwner().catch(() => {});
  await c.query("rollback").catch(() => {});
  await c.end();
}

console.log("\n" + "─".repeat(60));
console.log(`${pass} bestanden, ${fail} fehlgeschlagen — alle Testdaten zurückgerollt.`);
if (fail) {
  console.log("\nFehlgeschlagen:\n  - " + failures.join("\n  - "));
  process.exitCode = 1;
}
