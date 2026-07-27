#!/usr/bin/env node
// ============================================================
// Migrationen einspielen.
//
// Warum ein eigenes Skript und nicht die Supabase-CLI: `supabase db push`
// braucht eine Direktverbindung. Supabase hat den IPv4-Direktzugang für
// `db.<ref>.supabase.co` abgeschaltet – dort gibt es nur noch AAAA. Wer in
// einem Netz ohne IPv6 sitzt (Firmennetz, viele Mobilfunkzugänge), erreicht
// den Host schlicht nicht. Der Pooler ist über IPv4 erreichbar, deshalb geht
// dieses Skript den Weg über den Pooler und erzwingt IPv4-Auflösung.
//
// Angewendete Migrationen stehen in `schema_migration`. Jede läuft in einer
// eigenen Transaktion: Bricht eine ab, ist sie ganz oder gar nicht angewendet,
// und die davor bleiben bestehen.
//
//   DATABASE_URL=… node scripts/db-migrate.mjs            # offene anwenden
//   DATABASE_URL=… node scripts/db-migrate.mjs --dry-run  # nur auflisten
//   DATABASE_URL=… node scripts/db-migrate.mjs --baseline # als angewendet buchen
//   DATABASE_URL=… node scripts/db-migrate.mjs --force 0009_assignments.sql
//
// `--baseline` ist für den einmaligen Übergang gedacht: eine Datenbank, die
// schon von Hand auf Stand gebracht wurde, bekommt ihre Historie nachgetragen,
// ohne dass irgendetwas ausgeführt wird.
// ============================================================

import { createHash } from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv4first");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, "..", "supabase", "migrations");

let pg;
try {
  ({ default: pg } = await import("pg"));
} catch {
  console.error(
    "Das Paket `pg` fehlt. Einmalig installieren:\n" +
    "  npm install --save-dev --legacy-peer-deps pg\n" +
    "(`--legacy-peer-deps` ist nötig, solange react-day-picker React 19 nicht als Peer akzeptiert.)");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baseline = args.includes("--baseline");
const forceIndex = args.indexOf("--force");
const forced = forceIndex >= 0 ? args[forceIndex + 1] : null;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL fehlt.\n\n" +
    "Supabase → Project Settings → Database → Connection string → Session pooler,\n" +
    "z. B.  postgres://postgres.<ref>:<passwort>@aws-0-<region>.pooler.supabase.com:5432/postgres");
  process.exit(1);
}

const files = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort();
if (!files.length) { console.error("Keine Migrationen gefunden in", MIGRATIONS); process.exit(1); }

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 300_000,
  connectionTimeoutMillis: 20_000,
});

const sum = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

await client.connect();
try {
  await client.query(`
    create table if not exists schema_migration (
      name       text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )`);

  const known = new Map(
    (await client.query("select name, checksum from schema_migration")).rows
      .map(r => [r.name, r.checksum]));

  let applied = 0, skipped = 0, changed = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    const checksum = sum(sql);
    const seen = known.get(file);

    if (baseline) {
      await client.query(
        `insert into schema_migration (name, checksum) values ($1,$2)
         on conflict (name) do update set checksum = excluded.checksum`, [file, checksum]);
      console.log(`  gebucht   ${file}`);
      applied++;
      continue;
    }

    if (seen && file !== forced) {
      // Eine nachträglich geänderte Migration ist ein Warnsignal, kein Fehler:
      // Sie wurde bereits angewendet, der Inhalt weicht aber ab. Stillschweigend
      // zu übergehen wäre schlimmer als es zu sagen.
      if (seen !== checksum) {
        console.log(`  ABWEICHUNG ${file} – angewendet, aber seither geändert`);
        changed++;
      } else {
        skipped++;
      }
      continue;
    }

    if (dryRun) { console.log(`  offen     ${file}`); applied++; continue; }

    process.stdout.write(`  anwenden  ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        `insert into schema_migration (name, checksum) values ($1,$2)
         on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`,
        [file, checksum]);
      await client.query("commit");
      console.log("ok");
      applied++;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      console.log("FEHLGESCHLAGEN");
      console.error(`\n  ${error.code ?? ""} ${error.message}`);
      if (error.position) {
        const upto = sql.slice(0, Number(error.position));
        console.error(`  Zeile ${upto.split("\n").length}: ${upto.split("\n").pop().trim()}`);
      }
      if (error.hint) console.error(`  Hinweis: ${error.hint}`);
      console.error("\n  Abgebrochen. Vorherige Migrationen bleiben angewendet.");
      process.exitCode = 1;
      break;
    }
  }

  console.log(
    `\n${applied} ${baseline ? "gebucht" : dryRun ? "offen" : "angewendet"}, ` +
    `${skipped} bereits vorhanden` + (changed ? `, ${changed} abweichend` : ""));
} finally {
  await client.end();
}
