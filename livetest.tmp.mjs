import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const PW = readFileSync(process.argv[2] + "/testpw", "utf8").trim();
const BASE = "https://gitacademy.netlify.app";
let pass = 0, fail = 0;
const ok = (n, d = "") => { pass++; console.log(`  ✅ ${n}${d ? " — " + d : ""}`); };
const no = (n, d) => { fail++; console.log(`  ❌ ${n}\n       ${d}`); };
const check = async (n, fn) => { try { ok(n, await fn()); } catch (e) { no(n, String(e.message).slice(0, 180)); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

async function login(page, role) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#username", { timeout: 45000 });
  await page.fill("#username", `pruef-${role}@test.invalid`);
  await page.fill("#password", PW);
  await Promise.all([page.waitForURL(u => u.host.includes("netlify.app"), { timeout: 60000 }), page.click("#kc-login")]);
  await page.waitForTimeout(5000);
}
const browser = await chromium.launch();

for (const role of ["admin", "editor", "user"]) {
  console.log(`\n── Rolle: ${role} ──`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors = [], rest = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 120)));
  page.on("response", r => { if (r.url().includes("supabase.co/rest/v1")) rest.push({ s: r.status(), p: r.url().split("/rest/v1/")[1].split("?")[0] }); });

  await check("Anmeldung", async () => { await login(page, role); assert(page.url().includes("netlify.app"), page.url()); return "ok"; });
  await check("Supabase-Abfragen ohne Fehler", async () => {
    assert(rest.length > 0, "keine Abfrage beobachtet");
    const bad = rest.filter(r => r.s >= 400);
    assert(bad.length === 0, bad.map(b => `${b.p}:${b.s}`).join(", "));
    return `${rest.length} Abfragen, alle < 400`;
  });
  await check("Dashboard zeigt echte Inhalte", async () => {
    const body = await page.locator("body").innerText();
    assert(!body.includes("Demo-Modus"), "Demo-Modus sichtbar");
    return body.replace(/\s+/g, " ").slice(0, 70);
  });

  if (role === "admin") {
    await check("Verwaltung → Benutzer: echte Liste", async () => {
      await page.goto(BASE + "/verwaltung/benutzer", { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(3500);
      const b = await page.locator("body").innerText();
      assert(!b.includes("Demo-Ansicht"), "Demo-Banner sichtbar");
      assert(b.includes("test.invalid") || b.includes("porsche.co.at"), "kein echtes Konto gelistet");
      return "echte Benutzer sichtbar";
    });
    await check("Verwaltung → Märkte: echte Märkte", async () => {
      await page.goto(BASE + "/verwaltung/maerkte", { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(3500);
      const b = await page.locator("body").innerText();
      const f = ["Deutschland", "Österreich", "Schweiz", "Frankreich"].filter(m => b.includes(m));
      assert(f.length >= 3, "gefunden: " + f.join(","));
      return f.join(", ");
    });
    await check("Einstellungen: Datenbank erkannt", async () => {
      await page.goto(BASE + "/verwaltung/einstellungen", { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(3500);
      const b = await page.locator("body").innerText();
      assert(!b.includes("Nur mit verbundener Datenbank"), "Hinweis sichtbar");
      return "ok";
    });
  }
  if (role !== "user") {
    await check("Redaktion → Inhaltsbaum: echte Module", async () => {
      await page.goto(BASE + "/redaktion/inhalte", { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(3500);
      const b = await page.locator("body").innerText();
      const f = ["DSR", "Digital Service Reception", "ServiceQ"].filter(m => b.includes(m));
      assert(f.length > 0, "keine Seed-Inhalte: " + b.replace(/\s+/g, " ").slice(0, 120));
      return f.join(", ");
    });
  }
  if (role === "user") {
    await check("Katalog zeigt Seed-Inhalte", async () => {
      await page.goto(BASE + "/katalog", { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(3500);
      const b = await page.locator("body").innerText();
      assert(b.includes("DSR") || b.includes("Service"), b.replace(/\s+/g, " ").slice(0, 120));
      return b.replace(/\s+/g, " ").slice(0, 70);
    });
    await check("Verwaltung gesperrt", async () => {
      await page.goto(BASE + "/verwaltung/benutzer", { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2500);
      assert(!page.url().includes("/verwaltung"), "Zugriff möglich");
      return "umgeleitet";
    });
  }
  await check("Keine Laufzeitfehler", () => { assert(errors.length === 0, errors.join(" | ")); return "sauber"; });
  await ctx.close();
}
await browser.close();
console.log(`\n══════════════════════════════════════\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail > 0 ? 1 : 0);
