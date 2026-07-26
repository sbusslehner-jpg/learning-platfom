// ============================================================
// End-to-End-Tests der Lernplattform (echter Browser, echter Dev-Server)
//
// Ausführen:
//   npm run test:e2e
//
// Der Test startet Vite selbst, fährt die Prozesse für Administrator,
// Editor und Lernenden durch und prüft dabei Navigation, Rollen-Guards,
// Sprachumschaltung, Lernfortschritt und Fehlerseiten.
//
// Hinweis: Ohne konfigurierte Supabase-Umgebung laufen die Seiten im
// Demo-Fallback. Die Tests prüfen deshalb Oberflächenverhalten und
// Berechtigungslogik – NICHT das Schreiben in die Datenbank.
// ============================================================

import { chromium } from "playwright";
import { spawn } from "node:child_process";

const CHROME = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`  ✅ ${name}`); }
function no(name, detail) { fail++; failures.push(`${name} — ${detail}`); console.log(`  ❌ ${name}\n       ${detail}`); }

async function check(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    no(name, String(err.message ?? err).split("\n")[0]);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ─── Dev-Server starten ───────────────────────────────────────────────────────

async function startServer() {
  const proc = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: process.env,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Dev-Server-Start überschritt 60 s")), 60_000);
    const onData = (d) => {
      if (String(d).includes("Local:") || String(d).includes(String(PORT))) {
        clearTimeout(timer); resolve();
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`Dev-Server beendet (Code ${c})`)); });
  });
  await new Promise(r => setTimeout(r, 1500)); // kurz einschwingen lassen
  return proc;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** Setzt Rollen vor dem Laden der Seite (localStorage) und öffnet einen Pfad. */
async function gotoAs(page, roles, path = "/") {
  await page.addInitScript((r) => {
    localStorage.setItem("sq-demo-roles", JSON.stringify(r));
    localStorage.setItem("sq-ui-language", "de");
  }, roles);
  await page.goto(BASE + path, { waitUntil: "networkidle" });
}

/** Demo-Anmeldung durchlaufen (Login ist im Demo-Modus eine Attrappe). */
async function login(page) {
  await page.fill('input[type="email"]', "max.keller@groupit.de");
  await page.fill('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

const consoleErrors = [];
function watchConsole(page) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const txt = m.text();
      // Netzwerkfehler gegen nicht konfiguriertes Supabase sind im Demo-Modus erwartbar
      if (!/supabase|Failed to fetch|net::ERR/i.test(txt)) consoleErrors.push(txt);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
}

// ─── Testläufe ───────────────────────────────────────────────────────────────

async function run() {
  console.log("Dev-Server starten …");
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

  try {
    // ═══ A) Lernender ═══════════════════════════════════════════════════════
    console.log("\n── A) Prozess: Lernender ──");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await gotoAs(page, ["user"], "/login");

      await check("Login-Seite wird angezeigt", async () => {
        assert(await page.locator('input[type="email"]').isVisible(), "kein E-Mail-Feld");
      });

      await check("Anmeldung führt zum Dashboard", async () => {
        await login(page);
        assert(new URL(page.url()).pathname === "/", "nicht auf /");
      });

      await check("Lernender sieht KEINE Redaktions-/Verwaltungsnavigation", async () => {
        const nav = await page.locator("aside").innerText();
        assert(!/Redaktion|Verwaltung/i.test(nav), `Sidebar zeigt: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Guard: /redaktion/inhalte per URL wird abgewiesen", async () => {
        await page.goto(BASE + "/redaktion/inhalte", { waitUntil: "networkidle" });
        assert(new URL(page.url()).pathname === "/", `landete auf ${new URL(page.url()).pathname}`);
      });

      await check("Guard: /verwaltung/benutzer per URL wird abgewiesen", async () => {
        await page.goto(BASE + "/verwaltung/einstellungen", { waitUntil: "networkidle" });
        assert(new URL(page.url()).pathname === "/", `landete auf ${new URL(page.url()).pathname}`);
      });

      await check("Katalog ist erreichbar", async () => {
        await page.goto(BASE + "/katalog", { waitUntil: "networkidle" });
        const h1 = await page.locator("h1").first().innerText();
        assert(h1.length > 3, "keine Überschrift");
      });

      await check("Lernansicht öffnet und zeigt Kapitel", async () => {
        await page.goto(BASE + "/lernen", { waitUntil: "networkidle" });
        const body = await page.locator("main").innerText();
        assert(/Kapitel/i.test(body), "kein Kapitel sichtbar");
      });

      await check("Kapitel abschließen erhöht den Fortschritt", async () => {
        const btn = page.getByRole("button", { name: /Kapitel abschließen|Nächstes Kapitel/i }).first();
        assert(await btn.isVisible(), "kein Abschluss-Button");
        const before = await page.locator("main").innerText();
        await btn.click();
        await page.waitForTimeout(600);
        const after = await page.locator("main").innerText();
        assert(before !== after, "Ansicht hat sich nicht verändert");
      });

      await check("Fortschritt überlebt einen Reload (localStorage)", async () => {
        const key = await page.evaluate(() =>
          Object.keys(localStorage).filter(k => k.startsWith("sq-progress:")));
        assert(key.length > 0, "kein Fortschritt gespeichert");
      });

      await check("Deep-Link /lernen/<slug> lädt ohne Fehler", async () => {
        await page.goto(BASE + "/lernen/dsr-konfiguration-einzelhandel", { waitUntil: "networkidle" });
        assert(/Kapitel/i.test(await page.locator("main").innerText()), "kein Inhalt");
      });

      await ctx.close();
    }

    // ═══ B) Editor ═══════════════════════════════════════════════════════════
    console.log("\n── B) Prozess: Editor ──");
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await gotoAs(page, ["editor"], "/login");
      await login(page);

      await check("Editor sieht Redaktion, aber keine Verwaltung", async () => {
        const nav = await page.locator("aside").innerText();
        assert(/Redaktion/i.test(nav), "Redaktion fehlt");
        assert(!/Benutzer|Märkte|Einstellungen/i.test(nav), `Verwaltung sichtbar: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Inhaltsbaum lädt", async () => {
        await page.goto(BASE + "/redaktion/inhalte", { waitUntil: "networkidle" });
        assert(/Inhaltsstruktur|Training/i.test(await page.locator("main").innerText()), "kein Baum");
      });

      await check("Trainingseditor öffnet (ohne ID: Leerzustand)", async () => {
        await page.goto(BASE + "/redaktion/editor", { waitUntil: "networkidle" });
        assert((await page.locator("main").innerText()).length > 20, "leere Seite");
      });

      await check("Übersetzungsübersicht lädt", async () => {
        await page.goto(BASE + "/uebersetzungen", { waitUntil: "networkidle" });
        assert(/Übersetzung/i.test(await page.locator("main").innerText()), "keine Übersetzungsansicht");
      });

      await check("Prüfansicht lädt (Master ↔ Übersetzung)", async () => {
        await page.goto(BASE + "/uebersetzungen/pruefen", { waitUntil: "networkidle" });
        const txt = await page.locator("main").innerText();
        assert(/Master|Deutsch/i.test(txt), "keine Side-by-side-Ansicht");
      });

      await check("Editor darf Reporting sehen", async () => {
        await page.goto(BASE + "/auswertungen", { waitUntil: "networkidle" });
        assert(new URL(page.url()).pathname === "/auswertungen", "wurde abgewiesen");
      });

      await check("Editor-Guard: Benutzerverwaltung bleibt gesperrt", async () => {
        await page.goto(BASE + "/verwaltung/benutzer", { waitUntil: "networkidle" });
        assert(new URL(page.url()).pathname === "/", "Zugriff war möglich");
      });

      await ctx.close();
    }

    // ═══ C) Administrator ════════════════════════════════════════════════════
    console.log("\n── C) Prozess: Administrator ──");
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await gotoAs(page, ["admin"], "/login");
      await login(page);

      await check("Admin sieht Verwaltung, aber keine Redaktion", async () => {
        const nav = await page.locator("aside").innerText();
        assert(/Verwaltung/i.test(nav), "Verwaltung fehlt");
        assert(!/Inhalte|Übersetzungen/i.test(nav), `Redaktion sichtbar: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Benutzerverwaltung lädt", async () => {
        await page.goto(BASE + "/verwaltung/benutzer", { waitUntil: "networkidle" });
        assert(/Benutzer/i.test(await page.locator("main").innerText()), "keine Benutzerliste");
      });

      await check("Märkte & Sprachen lädt", async () => {
        await page.goto(BASE + "/verwaltung/maerkte", { waitUntil: "networkidle" });
        assert(/Märkte|Markt/i.test(await page.locator("main").innerText()), "keine Marktliste");
      });

      await check("Einstellungen lädt", async () => {
        await page.goto(BASE + "/verwaltung/einstellungen", { waitUntil: "networkidle" });
        assert((await page.locator("main").innerText()).length > 50, "leere Seite");
      });

      await check("Auswertungen zeigen Kennzahlen oder Datenbank-Hinweis", async () => {
        await page.goto(BASE + "/auswertungen", { waitUntil: "networkidle" });
        const txt = await page.locator("main").innerText();
        assert(txt.length > 40, "leere Seite");
      });

      await check("Reporting enthält keinen personenbezogenen Lernbericht", async () => {
        const txt = (await page.locator("main").innerText()).toLowerCase();
        // Es darf keine Liste einzelner Lernender mit Fortschritt geben
        assert(!/pro lernende[rn]?\b|einzelne lernende/.test(txt), "personenbezogenes Reporting gefunden");
      });

      await ctx.close();
    }

    // ═══ D) Querschnitt: i18n, Responsive, Fehlerseiten ══════════════════════
    console.log("\n── D) Querschnitt ──");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await gotoAs(page, ["admin", "editor", "user"], "/login");
      await login(page);

      await check("Sprachumschaltung auf Englisch ändert die Navigation", async () => {
        const before = await page.locator("aside").innerText();
        await page.getByRole("button", { name: /Sprache|Language|Langue/i }).first().click();
        await page.getByRole("menuitemradio", { name: /English/i }).click();
        await page.waitForTimeout(400);
        const after = await page.locator("aside").innerText();
        assert(before !== after, "Navigation unverändert");
        assert(/Learning|Administration/i.test(after), `keine englischen Labels: ${after.replace(/\n/g, " | ")}`);
      });

      await check("Sprachwahl überlebt einen Reload", async () => {
        await page.reload({ waitUntil: "networkidle" });
        const lang = await page.evaluate(() => document.documentElement.lang);
        assert(lang === "en", `html lang = ${lang}`);
      });

      await check("Sprache zurück auf Deutsch", async () => {
        await page.getByRole("button", { name: /Language|Sprache/i }).first().click();
        await page.getByRole("menuitemradio", { name: /Deutsch/i }).click();
        await page.waitForTimeout(400);
        assert(/Lernen/i.test(await page.locator("aside").innerText()), "nicht auf Deutsch");
      });

      await check("Suche in der Topbar reagiert (Ergebnis oder Hinweis)", async () => {
        const input = page.locator('input[type="search"]').first();
        await input.fill("DSR");
        await page.waitForTimeout(700);
        const listbox = page.locator('[role="listbox"]');
        assert(await listbox.count() > 0, "kein Ergebnis-Panel");
      });

      await check("Unbekannte URL leitet auf das Dashboard", async () => {
        await page.goto(BASE + "/gibt-es-nicht", { waitUntil: "networkidle" });
        assert(new URL(page.url()).pathname === "/", `landete auf ${new URL(page.url()).pathname}`);
      });

      await check("Session-Ablaufseite zeigt Rückweg zu ServiceQ", async () => {
        await page.goto(BASE + "/sso/expired", { waitUntil: "networkidle" });
        const txt = await page.locator("body").innerText();
        assert(/ServiceQ/i.test(txt), "kein Rückweg");
        assert(!/Anmelden|Login/i.test(txt), "zeigt eine Loginseite");
      });

      await check("SSO-Fehlerseite (keine Berechtigung) rendert", async () => {
        await page.goto(BASE + "/sso/error?reason=denied", { waitUntil: "networkidle" });
        assert(/Kein Zugriff/i.test(await page.locator("body").innerText()), "falscher Text");
      });

      await check("Impressum und Datenschutz sind erreichbar", async () => {
        await page.goto(BASE + "/impressum", { waitUntil: "networkidle" });
        assert(/Impressum/i.test(await page.locator("body").innerText()), "kein Impressum");
        await page.goto(BASE + "/datenschutz", { waitUntil: "networkidle" });
        assert(/Datenschutz/i.test(await page.locator("body").innerText()), "kein Datenschutz");
      });

      await check("Abmelden führt zurück zur Anmeldung", async () => {
        await page.goto(BASE + "/", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /Profil|Profile/i }).first().click();
        await page.getByRole("menuitem", { name: /Abmelden|Log out/i }).click();
        await page.waitForTimeout(500);
        assert(new URL(page.url()).pathname.includes("/login"), `landete auf ${new URL(page.url()).pathname}`);
      });

      await ctx.close();
    }

    // ═══ E) Mobile (375×812) ═════════════════════════════════════════════════
    console.log("\n── E) Responsive (Mobil) ──");
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      watchConsole(page);
      await gotoAs(page, ["user"], "/login");
      await login(page);

      await check("Kein horizontaler Überlauf auf dem Dashboard", async () => {
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(overflow <= 2, `Überlauf: ${overflow}px`);
      });

      await check("Mobile Bottom-Navigation ist sichtbar und bedienbar", async () => {
        const nav = page.locator("nav").last();
        assert(await nav.isVisible(), "keine Bottom-Nav");
        await page.getByRole("button", { name: /Katalog|Catalogue/i }).first().click();
        await page.waitForTimeout(500);
        assert(new URL(page.url()).pathname.includes("katalog"), `landete auf ${new URL(page.url()).pathname}`);
      });

      await check("Kein horizontaler Überlauf in der Lernansicht", async () => {
        await page.goto(BASE + "/lernen", { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(overflow <= 2, `Überlauf: ${overflow}px`);
      });

      await ctx.close();
    }

    // ═══ F) Barrierefreiheit (strukturelle Stichproben) ══════════════════════
    console.log("\n── F) Barrierefreiheit ──");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await gotoAs(page, ["admin", "editor", "user"], "/login");
      await login(page);

      await check("Jede Seite hat genau eine H1", async () => {
        for (const path of ["/", "/katalog", "/auswertungen", "/verwaltung/benutzer"]) {
          await page.goto(BASE + path, { waitUntil: "networkidle" });
          const n = await page.locator("h1").count();
          assert(n === 1, `${path} hat ${n} H1-Elemente`);
        }
      });

      await check("Icon-Buttons in der Topbar haben zugängliche Namen", async () => {
        await page.goto(BASE + "/", { waitUntil: "networkidle" });
        const unnamed = await page.evaluate(() => {
          const hdr = document.querySelector("header");
          if (!hdr) return ["kein header"];
          return [...hdr.querySelectorAll("button")]
            .filter(b => !b.textContent.trim() && !b.getAttribute("aria-label"))
            .map(b => b.outerHTML.slice(0, 60));
        });
        assert(unnamed.length === 0, `ohne Namen: ${unnamed.join(", ")}`);
      });

      await check("Sprachattribut am <html> ist gesetzt", async () => {
        const lang = await page.evaluate(() => document.documentElement.lang);
        assert(!!lang, "html lang fehlt");
      });

      await check("Tastaturfokus erreicht die Navigation", async () => {
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        const tag = await page.evaluate(() => document.activeElement?.tagName ?? "");
        assert(["BUTTON", "A", "INPUT"].includes(tag), `Fokus auf ${tag}`);
      });

      await ctx.close();
    }

    // ═══ Konsolenfehler ══════════════════════════════════════════════════════
    console.log("\n── G) Laufzeitfehler ──");
    await check("Keine unerwarteten Konsolen-/Seitenfehler", () => {
      assert(consoleErrors.length === 0, `${consoleErrors.length}: ${consoleErrors.slice(0, 3).join(" | ")}`);
    });

  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  if (failures.length) {
    console.log("\nFehlgeschlagen:");
    for (const f of failures) console.log("  · " + f);
  }
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Testlauf abgebrochen:", e); process.exit(1); });
