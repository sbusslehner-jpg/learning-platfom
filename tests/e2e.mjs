// ============================================================
// End-to-End-Tests der Lernplattform (echter Browser, echter Server)
//
// Ausführen:  npm run test:e2e
//
// Der Test baut die Anwendung, serviert sie über `vite preview` und fährt
// die Prozesse für Administrator, Editor und Lernenden durch: Navigation,
// Rollen-Guards, Sprachumschaltung, Lernfortschritt, Fehlerseiten,
// Responsive-Verhalten und Barrierefreiheits-Stichproben.
//
// Leistungshinweis: Ein vollständiger Seiten-Reload kostet in dieser
// Umgebung ~13 s (langsames Headless-Chromium). Navigation innerhalb der
// Anwendung wird deshalb über den Router ausgeführt (History-API bzw.
// echte Klicks) – identische Codepfade, aber ~15× schneller. Mindestens
// ein Guard wird zusätzlich mit einem echten Kaltstart geprüft.
//
// Ohne konfigurierte Supabase-Umgebung laufen die Seiten im Demo-Fallback.
// Geprüft werden daher Oberflächenverhalten und Berechtigungslogik –
// NICHT das Schreiben in die Datenbank.
// ============================================================

import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";

// Normalerweise findet Playwright seinen Browser selbst (`npx playwright
// install chromium`). Nur Umgebungen, die ihn woanders vorinstallieren,
// brauchen einen expliziten Pfad – ein fest verdrahteter Pfad ließe den
// Testlauf überall sonst scheitern.
const CHROME =
  process.env.PLAYWRIGHT_CHROME ||
  ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"].find(existsSync) ||
  null;
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;

// Phasenauswahl: `node tests/e2e.mjs A B` führt nur diese Phasen aus.
const WANT = new Set(process.argv.slice(2).map(a => a.toUpperCase()));
const want = (p) => WANT.size === 0 || WANT.has(p);

let pass = 0, fail = 0;
const failures = [];
const consoleErrors = [];

const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const no = (n, d) => { fail++; failures.push(`${n} — ${d}`); console.log(`  ❌ ${n}\n       ${d}`); };

async function check(name, fn) {
  try { await fn(); ok(name); }
  catch (err) { no(name, String(err.message ?? err).split("\n")[0].slice(0, 200)); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// ─── Server ───────────────────────────────────────────────────────────────────

/** Läuft bereits ein Server auf dem Port? */
async function serverAlive() {
  try {
    const r = await fetch(BASE + "/", { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

async function startServer() {
  // Bereits laufender Server (z. B. separat gestartet) wird weiterverwendet.
  if (await serverAlive()) {
    console.log("Vorhandenen Server auf Port " + PORT + " verwenden.");
    return null;
  }
  if (!process.env.SKIP_BUILD) {
    console.log("Anwendung bauen …");
    // `ALLOW_DEMO_BUILD` ist die ausdrückliche Freigabe für genau diesen Fall:
    // Die Suite prüft den Demo-Modus, also muss sie ihn bauen dürfen. Ohne die
    // Freigabe lehnt vite.config.ts einen Produktions-Build mit Demo-Modus ab
    // (R-15) – das soll ein versehentliches Deploy verhindern, nicht diesen Test.
    execSync("npx vite build", {
      stdio: "pipe",
      // Alle Sprachen freischalten: Die Suite prueft die i18n-Mechanik.
      // Produktiv wird nur Deutsch angeboten (R-05) – das sichert die
      // Keycloak-Suite ab, die produktionsnah baut.
      env: {
        ...process.env,
        VITE_DEMO_MODE: "true",
        ALLOW_DEMO_BUILD: "1",
        VITE_UI_LANGUAGES: "de,en,fr",
      },
    });
  }
  console.log("Server starten …");
  const proc = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Serverstart überschritt 60 s")), 60_000);
    const onData = (d) => { if (String(d).includes(String(PORT))) { clearTimeout(timer); resolve(); } };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`Server beendet (Code ${c})`)); });
  });
  await new Promise(r => setTimeout(r, 1000));
  return proc;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

/** Router-Navigation ohne Reload (identische Guard-/Routen-Logik, ~15× schneller). */
async function routeTo(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(350);
}

const currentPath = (page) => new URL(page.url()).pathname;

/** Kaltstart mit vorgegebenen Rollen; teuer (~13 s) – sparsam verwenden. */
async function coldStart(page, roles, path = "/login") {
  await page.addInitScript((r) => {
    localStorage.setItem("sq-demo-roles", JSON.stringify(r));
    localStorage.setItem("sq-ui-language", "de");
  }, roles);
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

/** Demo-Anmeldung (im Demo-Modus ohne Prüfung von Zugangsdaten). */
async function login(page) {
  await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
  await page.fill('input[type="email"]', "max.keller@groupit.de");
  await page.fill('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');
  // <main> ist auf jedem Viewport vorhanden; <aside> ist mobil ausgeblendet.
  await page.waitForSelector("main", { timeout: 30_000 });
  await page.waitForTimeout(300);
}

function watchConsole(page) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const txt = m.text();
    // Fehlgeschlagene Supabase-Aufrufe sind im Demo-Modus (ohne Konfiguration) erwartbar
    if (!/supabase|Failed to fetch|net::ERR|ERR_CONNECTION/i.test(txt)) consoleErrors.push(txt);
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
}

/** Wartet, bis eine Seite ihren Ladezustand verlassen hat. */
async function settled(page, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const t = document.querySelector("main")?.innerText ?? "";
      // Ladeplatzhalter dürfen nirgends mehr im Inhalt stehen
      return t.length > 20 && !/(Lädt …|Loading …|Chargement …)/.test(t);
    },
    null, { timeout },
  ).catch(() => { /* Seite ohne Ladezustand */ });
}

/** Sidebar-Text (Desktop-Navigation, nicht die mobile Leiste). */
const sidebarText = (page) => page.locator("aside").first().innerText();

/**
 * Startet den Browser. Fehlt er, ist der Hinweis auf `playwright install`
 * mehr wert als der rohe Playwright-Fehler.
 */
async function launchBrowser() {
  try {
    return await chromium.launch({
      ...(CHROME ? { executablePath: CHROME } : {}),
      args: ["--no-sandbox"],
    });
  } catch (error) {
    console.error("\nBrowser konnte nicht gestartet werden.");
    console.error("Einmalig einrichten:  npx playwright install chromium");
    console.error("Eigener Pfad:         PLAYWRIGHT_CHROME=/pfad/zum/chrome npm run test:e2e\n");
    throw error;
  }
}

async function run() {
  const server = await startServer();
  const browser = await launchBrowser();

  try {
    // ═══ A) Lernender ═══════════════════════════════════════════════════════
    console.log("\n── A) Prozess: Lernender ──");
    if (want("A"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["user"]);

      await check("Anmeldeseite erscheint mit Demo-Hinweis", async () => {
        const txt = await page.locator("body").innerText();
        assert(/Anmelden/i.test(txt), "kein Anmeldeformular");
        assert(/Demo-Zugang/i.test(txt), "Demo-Hinweis fehlt (irreführender echter Login)");
      });

      await check("Anmeldung führt zum Dashboard", async () => {
        await login(page);
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });

      await check("Lernender sieht KEINE Redaktion/Verwaltung in der Navigation", async () => {
        const nav = await sidebarText(page);
        assert(!/Redaktion|Verwaltung/i.test(nav), `Sidebar: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Guard: /redaktion/inhalte wird abgewiesen", async () => {
        await routeTo(page, "/redaktion/inhalte");
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });

      await check("Guard: /verwaltung/einstellungen wird abgewiesen", async () => {
        await routeTo(page, "/verwaltung/einstellungen");
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });

      await check("Guard: /auswertungen wird abgewiesen (kein reporting.view)", async () => {
        await routeTo(page, "/auswertungen");
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });

      await check("Katalog ist über die Navigation erreichbar", async () => {
        await page.locator("aside").first().getByRole("button", { name: /Katalog/i }).click();
        await page.waitForTimeout(400);
        assert(currentPath(page).includes("katalog"), `landete auf ${currentPath(page)}`);
        assert((await page.locator("h1").first().innerText()).length > 3, "keine Überschrift");
      });

      await check("Lernansicht zeigt Kapitel", async () => {
        await routeTo(page, "/lernen");
        assert(/Kapitel/i.test(await page.locator("main").innerText()), "kein Kapitel");
      });

      await check("Kapitel abschließen verändert den Zustand", async () => {
        const btn = page.getByRole("button", { name: /Kapitel abschließen|Nächstes Kapitel/i }).first();
        assert(await btn.isVisible(), "kein Abschluss-Button");
        const before = await page.locator("main").innerText();
        await btn.click();
        await page.waitForTimeout(700);
        assert(before !== await page.locator("main").innerText(), "Ansicht unverändert");
      });

      await check("Fortschritt wird persistiert (localStorage)", async () => {
        const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("sq-progress:")));
        assert(keys.length > 0, "kein Fortschritt gespeichert");
      });

      // Der simulierte Player ist mit R-03 entfallen. Er tat so, als liefe ein
      // Video, während gar keine Datei existierte – ein Fortschrittsbalken, der
      // nichts abbildet, ist schlimmer als gar keiner.
      //
      // Ohne hinterlegte Datei – und in der Demo gibt es keine – muss die
      // Lernansicht das sagen, statt einen toten Player zu zeigen.
      await check("Video ohne hinterlegte Datei nennt das offen", async () => {
        await routeTo(page, "/lernen");
        await page.getByRole("button", { name: /DealerData-Synchronisation/i }).first().click();
        await page.waitForTimeout(500);
        const text = await page.locator("main").innerText({ timeout: 15_000 });
        assert(/noch kein Video hinterlegt/i.test(text),
          "kein Hinweis auf die fehlende Datei");
        assert(await page.getByRole("button", { name: /Video abspielen/i }).count() === 0,
          "simulierter Player ist noch vorhanden");
      });

      await check("Bild ohne hinterlegte Datei nennt das offen", async () => {
        const text = await page.locator("main").innerText({ timeout: 15_000 });
        assert(/noch kein Bild hinterlegt/i.test(text), "kein Hinweis auf das fehlende Bild");
        // Ein Platzhalterbild mit der Aufschrift „Screenshot" behauptete einen
        // Inhalt, den es nicht gibt.
        assert(!/^Screenshot$/m.test(text), "Platzhalterbild ist noch vorhanden");
      });

      await check("Deep-Link /lernen/<slug> lädt Inhalt", async () => {
        await routeTo(page, "/lernen/dsr-konfiguration-einzelhandel");
        assert(currentPath(page).includes("dsr-konfiguration"), "Route verworfen");
        assert(/Kapitel/i.test(await page.locator("main").innerText({ timeout: 15_000 })), "kein Inhalt");
      });

      await ctx.close();

    }

    // ═══ B) Editor ═══════════════════════════════════════════════════════════
    console.log("\n── B) Prozess: Editor ──");
    if (want("B"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["editor"]);
      await login(page);

      await check("Editor sieht Redaktion, aber keine Benutzerverwaltung", async () => {
        const nav = await sidebarText(page);
        assert(/Redaktion/i.test(nav), "Redaktion fehlt");
        assert(!/Benutzer|Märkte/i.test(nav), `Verwaltung sichtbar: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Inhaltsbaum lädt", async () => {
        await routeTo(page, "/redaktion/inhalte");
        assert(/Inhaltsstruktur|Training/i.test(await page.locator("main").innerText()), "kein Baum");
      });

      await check("Trainingseditor ohne ID zeigt einen Leerzustand", async () => {
        await routeTo(page, "/redaktion/editor");
        assert((await page.locator("main").innerText()).length > 20, "leere Seite");
      });

      await check("Übersetzungsübersicht lädt", async () => {
        await routeTo(page, "/uebersetzungen");
        assert(/Übersetzung/i.test(await page.locator("main").innerText()), "keine Übersicht");
      });

      await check("Prüfansicht ohne Parameter zeigt einen Leerzustand", async () => {
        await routeTo(page, "/uebersetzungen/pruefen");
        const txt = await page.locator("main").innerText();
        assert(txt.length > 20, "leere Seite");
        assert(!/undefined|NaN/i.test(txt), "fehlerhafte Platzhalter");
      });

      await check("Prüfansicht mit Parametern zeigt Master und Zielsprache", async () => {
        await routeTo(page, "/uebersetzungen/pruefen/demo-training/fr");
        // Ladezustand muss sich auflösen (Zeitgrenze der Datenschicht greift)
        await page.waitForFunction(
          () => !/^\s*Lädt/.test(document.querySelector("main")?.innerText ?? ""),
          null, { timeout: 20_000 });
        const txt = await page.locator("main").innerText();
        assert(/Master|Deutsch/i.test(txt), `keine Side-by-side-Ansicht: ${txt.slice(0, 120).replace(/\n/g, " | ")}`);
      });

      await check("Editor darf Auswertungen sehen", async () => {
        await routeTo(page, "/auswertungen");
        assert(currentPath(page) === "/auswertungen", "wurde abgewiesen");
      });

      await check("Guard: Benutzerverwaltung bleibt für Editor gesperrt", async () => {
        await routeTo(page, "/verwaltung/benutzer");
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });

      await ctx.close();
    }

    // ═══ C) Administrator ════════════════════════════════════════════════════
    console.log("\n── C) Prozess: Administrator ──");
    if (want("C"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["admin"]);
      await login(page);

      await check("Admin sieht Verwaltung, aber keine Redaktion", async () => {
        const nav = await sidebarText(page);
        assert(/Verwaltung/i.test(nav), "Verwaltung fehlt");
        assert(!/Inhalte|Übersetzungen/i.test(nav), `Redaktion sichtbar: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Benutzerverwaltung lädt mit Statusangabe", async () => {
        await routeTo(page, "/verwaltung/benutzer");
        await settled(page);
        const txt = await page.locator("main").innerText();
        assert(/Benutzer/i.test(txt), "keine Benutzerliste");
        assert(/Aktiv|Inaktiv|Demo/i.test(txt), "keine Status-/Demo-Angabe");
      });

      await check("Märkte & Sprachen lädt", async () => {
        await routeTo(page, "/verwaltung/maerkte");
        await settled(page);
        assert(/Markt|Märkte/i.test(await page.locator("main").innerText()), "keine Marktliste");
      });

      await check("Einstellungen lädt", async () => {
        await routeTo(page, "/verwaltung/einstellungen");
        assert((await page.locator("main").innerText()).length > 50, "leere Seite");
      });

      await check("Einstellungen enthalten keinen fabrizierten Verbindungstest", async () => {
        const txt = await page.locator("main").innerText();
        assert(!/312\s*ms/i.test(txt), "fabriziertes Messergebnis sichtbar");
      });

      await check("Auswertungen zeigen Kennzahlen oder Datenbank-Hinweis", async () => {
        await routeTo(page, "/auswertungen");
        await settled(page);
        assert((await page.locator("main").innerText()).length > 40, "leere Seite");
      });

      await check("Auswertungen weisen Datenschutz-Grenze aus", async () => {
        const txt = await page.locator("main").innerText();
        assert(/Summen|personenbezogen|einzelne Lernende/i.test(txt), "kein Datenschutzhinweis");
      });

      await ctx.close();
    }

    // ═══ D) Querschnitt ══════════════════════════════════════════════════════
    console.log("\n── D) Querschnitt: i18n, Suche, Fehlerseiten ──");
    if (want("D"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["admin", "editor", "user"]);
      await login(page);

      await check("Sprachumschaltung auf Englisch übersetzt die Navigation", async () => {
        const before = await sidebarText(page);
        await page.locator("header").getByRole("button", { name: /Sprache|Language|Langue/i }).first().click();
        await page.getByRole("menuitemradio", { name: /English/i }).click();
        await page.waitForTimeout(400);
        const after = await sidebarText(page);
        assert(before !== after, "Navigation unverändert");
        assert(/Learning|Administration/i.test(after), `keine englischen Labels: ${after.replace(/\n/g, " | ")}`);
      });

      await check("html-lang folgt der Sprachwahl", async () => {
        assert(await page.evaluate(() => document.documentElement.lang) === "en", "lang nicht en");
      });

      await check("Sprachwahl wird persistiert", async () => {
        const stored = await page.evaluate(() => localStorage.getItem("sq-ui-language"));
        assert(stored === "en", `gespeichert: ${stored}`);
      });

      await check("Rückschaltung auf Deutsch funktioniert", async () => {
        await page.locator("header").getByRole("button", { name: /Language|Sprache/i }).first().click();
        await page.getByRole("menuitemradio", { name: /Deutsch/i }).click();
        await page.waitForTimeout(400);
        assert(/Lernen/i.test(await sidebarText(page)), "nicht auf Deutsch");
      });

      await check("Topbar-Suche zeigt ein Ergebnis-Panel", async () => {
        await page.locator('header input[type="search"]').fill("DSR");
        await page.waitForTimeout(800);
        assert(await page.locator('[role="listbox"]').count() > 0, "kein Panel");
      });

      await check("Rollenwechsel im Profilmenü blendet Bereiche aus", async () => {
        await page.keyboard.press("Escape");
        await page.locator("header").getByRole("button", { name: /Profil|Profile/i }).first().click();
        await page.waitForTimeout(200);
        // Administrator- und Editor-Rolle abwählen → nur Lernender bleibt
        await page.getByRole("checkbox").nth(0).uncheck();
        await page.getByRole("checkbox").nth(1).uncheck();
        await page.waitForTimeout(400);
        const nav = await sidebarText(page);
        assert(!/Verwaltung|Redaktion/i.test(nav), `noch sichtbar: ${nav.replace(/\n/g, " | ")}`);
      });

      await check("Unbekannte Route leitet auf das Dashboard", async () => {
        await routeTo(page, "/gibt-es-nicht");
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });

      await check("Session-Ablaufseite verweist auf ServiceQ, nicht auf Login", async () => {
        await routeTo(page, "/sso/expired");
        const txt = await page.locator("body").innerText();
        assert(/ServiceQ/i.test(txt), "kein Rückweg zu ServiceQ");
        assert(!/Passwort/i.test(txt), "zeigt Anmeldefelder");
      });

      await check("SSO-Fehlerseite 'keine Berechtigung' rendert", async () => {
        await routeTo(page, "/sso/error?reason=denied");
        assert(/Kein Zugriff/i.test(await page.locator("body").innerText()), "falscher Text");
      });

      await check("Impressum und Datenschutz sind erreichbar", async () => {
        await routeTo(page, "/impressum");
        assert(/Impressum/i.test(await page.locator("body").innerText()), "kein Impressum");
        await routeTo(page, "/datenschutz");
        assert(/Datenschutz/i.test(await page.locator("body").innerText()), "kein Datenschutz");
      });

      await ctx.close();
    }

    // ═══ E) Abmelden (eigener Kontext) ═══════════════════════════════════════
    console.log("\n── E) Abmelden ──");
    if (want("E"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["user"]);
      await login(page);

      await check("Abmelden über das Profilmenü führt zur Anmeldung (war tot)", async () => {
        await page.locator("header").getByRole("button", { name: /Profil|Profile/i }).first().click();
        await page.waitForTimeout(200);
        await page.getByRole("menuitem", { name: /Abmelden|Log out/i }).click();
        await page.waitForTimeout(600);
        assert(currentPath(page).includes("/login"), `landete auf ${currentPath(page)}`);
      });

      await ctx.close();
    }

    // ═══ F) Kaltstart-Guard (echter Reload) ══════════════════════════════════
    console.log("\n── F) Guard bei echtem Kaltstart ──");
    if (want("F"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      // Direkter Aufruf einer Verwaltungs-URL als Lernender, ohne Anmeldung
      await coldStart(page, ["user"], "/verwaltung/benutzer");
      await check("Direkter URL-Aufruf ohne Anmeldung landet auf der Anmeldeseite", async () => {
        await page.waitForTimeout(800);
        assert(currentPath(page).includes("/login"), `landete auf ${currentPath(page)}`);
      });
      await check("Nach Anmeldung bleibt die Verwaltung für Lernende gesperrt", async () => {
        await login(page);
        await routeTo(page, "/verwaltung/benutzer");
        assert(currentPath(page) === "/", `landete auf ${currentPath(page)}`);
      });
      await ctx.close();
    }

    // ═══ G) Responsive (Mobil) ═══════════════════════════════════════════════
    console.log("\n── G) Responsive (375×812) ──");
    if (want("G"))
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["user"]);
      await login(page);

      const overflow = () => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);

      await check("Dashboard ohne horizontalen Überlauf", async () => {
        const o = await overflow();
        assert(o <= 2, `Überlauf ${o}px`);
      });

      await check("Mobile Bottom-Navigation ist bedienbar (Suche war tot)", async () => {
        const nav = page.locator("nav").last();
        assert(await nav.isVisible(), "keine Bottom-Nav");
        await nav.getByRole("button", { name: /Suche|Search/i }).click();
        await page.waitForTimeout(500);
        assert(currentPath(page).includes("katalog"), `landete auf ${currentPath(page)}`);
      });

      await check("Lernansicht ohne horizontalen Überlauf", async () => {
        await routeTo(page, "/lernen");
        const o = await overflow();
        assert(o <= 2, `Überlauf ${o}px`);
      });

      await ctx.close();

      const tabletCtx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
      const tablet = await tabletCtx.newPage();
      watchConsole(tablet);
      await coldStart(tablet, ["admin", "editor", "user"]);
      await login(tablet);

      await check("Tablet-Dashboard (768×1024) ohne horizontalen Überlauf", async () => {
        const tabletOverflow = await tablet.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(tabletOverflow <= 2, `Überlauf ${tabletOverflow}px`);
      });
      await check("Tablet-Verwaltung bleibt bedienbar", async () => {
        await routeTo(tablet, "/verwaltung/benutzer");
        const body = await tablet.locator("body").innerText();
        assert(/Benutzer/i.test(body), "Benutzerverwaltung nicht sichtbar");
      });
      await tabletCtx.close();
    }

    // ═══ H) Barrierefreiheit ═════════════════════════════════════════════════
    console.log("\n── H) Barrierefreiheit ──");
    if (want("H"))
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      watchConsole(page);
      await coldStart(page, ["admin", "editor", "user"]);
      await login(page);

      await check("Jede geprüfte Seite hat genau eine H1", async () => {
        const bad = [];
        for (const p of ["/", "/katalog", "/auswertungen", "/verwaltung/benutzer", "/verwaltung/maerkte"]) {
          await routeTo(page, p);
          const n = await page.locator("h1").count();
          if (n !== 1) bad.push(`${p}:${n}`);
        }
        assert(bad.length === 0, `abweichend: ${bad.join(", ")}`);
      });

      await check("Alle Icon-Buttons der Topbar haben zugängliche Namen", async () => {
        const unnamed = await page.evaluate(() => [...(document.querySelector("header")?.querySelectorAll("button") ?? [])]
          .filter(b => !b.textContent.trim() && !b.getAttribute("aria-label"))
          .map(b => b.outerHTML.slice(0, 50)));
        assert(unnamed.length === 0, `ohne Namen: ${unnamed.join(" | ")}`);
      });

      await check("Aktiver Navigationspunkt ist als aria-current markiert", async () => {
        await routeTo(page, "/katalog");
        const n = await page.locator('aside [aria-current="page"]').count();
        assert(n >= 1, "kein aria-current in der Sidebar");
      });

      await check("Sprachattribut am <html> ist gesetzt", async () => {
        assert(!!(await page.evaluate(() => document.documentElement.lang)), "html lang fehlt");
      });

      await check("Tastaturnavigation erreicht fokussierbare Elemente", async () => {
        await routeTo(page, "/");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        const tag = await page.evaluate(() => document.activeElement?.tagName ?? "");
        assert(["BUTTON", "A", "INPUT", "SELECT"].includes(tag), `Fokus auf ${tag}`);
      });

      await check("Tabellen liegen in scrollbaren Containern (kein Layoutbruch)", async () => {
        await routeTo(page, "/verwaltung/maerkte");
        await settled(page);
        const bad = await page.evaluate(() => [...document.querySelectorAll("table")]
          .filter(tb => {
            let el = tb.parentElement, guarded = false;
            for (let i = 0; el && i < 3; i++, el = el.parentElement) {
              const ov = getComputedStyle(el).overflowX;
              if (ov === "auto" || ov === "scroll") { guarded = true; break; }
            }
            return !guarded;
          }).length);
        assert(bad === 0, `${bad} Tabelle(n) ohne overflow-Container`);
      });

      await ctx.close();
    }

    // ═══ I) Laufzeitfehler ═══════════════════════════════════════════════════
    console.log("\n── I) Laufzeitfehler ──");
    await check("Keine unerwarteten Konsolen-/Seitenfehler", () => {
      assert(consoleErrors.length === 0, `${consoleErrors.length}: ${[...new Set(consoleErrors)].slice(0, 3).join(" | ")}`);
    });

  } finally {
    await browser.close();
    server?.kill("SIGTERM");
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`Ergebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  if (failures.length) {
    console.log("\nFehlgeschlagen:");
    for (const f of failures) console.log("  · " + f);
  }
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Testlauf abgebrochen:", e); process.exit(1); });
