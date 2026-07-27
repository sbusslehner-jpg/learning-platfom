// ============================================================
// Verifikation des Keycloak-Modus im echten Browser.
//
// Ausführen:  node tests/keycloak-mode.mjs
//
// Baut die Anwendung mit gesetzten VITE_KEYCLOAK_*-Variablen, serviert sie und
// prüft gegen einen Stub-Keycloak (nur Discovery-Dokument), dass die Anmeldung
// tatsächlich als Authorization Code Flow mit PKCE beginnt und keine Tokens im
// localStorage landen.
//
// Ein vollständiger Anmelde-Rundlauf gegen eine echte Keycloak-Instanz ist damit
// NICHT abgedeckt – dafür fehlt in dieser Umgebung der Docker-Zugang.
// ============================================================

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";

// Siehe tests/e2e.mjs: fest verdrahtete Browserpfade laufen nur in genau
// einer Umgebung. Playwright findet den Browser sonst selbst.
const CHROME =
  process.env.PLAYWRIGHT_CHROME ||
  ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"].find(existsSync) ||
  null;
const KC_PORT = 8099;
const APP_PORT = 4322;
const KC = `http://localhost:${KC_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
// Nur für die CSP-Prüfung: Die Herkunft muss in img-src, media-src und
// connect-src auftauchen, sonst blockiert der Browser Bilder und Videos aus
// der Medienablage (R-03).
const SB = "https://beispiel.supabase.co";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✅ ${n}`); };
const no = (n, d) => { fail++; console.log(`  ❌ ${n}\n       ${d}`); };
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) {
  try { await fn(); ok(name); } catch (e) { no(name, String(e.message).slice(0, 180)); }
}

// ─── Stub-Keycloak: nur das Discovery-Dokument ───────────────────────────────
const kcServer = http.createServer((req, res) => {
  if (req.url?.includes("/.well-known/openid-configuration")) {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify({
      issuer: `${KC}/realms/serviceq`,
      authorization_endpoint: `${KC}/realms/serviceq/protocol/openid-connect/auth`,
      token_endpoint: `${KC}/realms/serviceq/protocol/openid-connect/token`,
      end_session_endpoint: `${KC}/realms/serviceq/protocol/openid-connect/logout`,
      jwks_uri: `${KC}/realms/serviceq/protocol/openid-connect/certs`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    }));
  }
  res.writeHead(404); res.end();
});

async function run() {
  console.log("Anwendung im Keycloak-Modus bauen …");
  execSync("npx vite build --outDir dist-kc", {
    stdio: "pipe",
    env: {
      ...process.env,
      VITE_KEYCLOAK_URL: KC,
      VITE_KEYCLOAK_REALM: "serviceq",
      VITE_KEYCLOAK_CLIENT_ID: "learning-platform",
      VITE_SUPABASE_URL: SB,
    },
  });

  // ── Sicherheits-Header (R-14) ──────────────────────────────────────────────
  // Sie werden beim Build erzeugt, nicht statisch gepflegt. Geht der Schritt
  // verloren, liefe die Seite ohne CSP – und niemand merkte es, weil nichts
  // sichtbar kaputtgeht.
  await check("_headers wird beim Build erzeugt", () => {
    assert(existsSync("dist-kc/_headers"), "dist-kc/_headers fehlt");
  });
  await check("CSP erlaubt genau die konfigurierte Keycloak-Adresse", () => {
    const h = readFileSync("dist-kc/_headers", "utf8");
    const csp = h.split("\n").find(l => l.includes("Content-Security-Policy")) ?? "";
    assert(csp.includes(`connect-src`), "connect-src fehlt");
    assert(csp.includes(KC), `Keycloak-Adresse fehlt in der CSP: ${csp.slice(0, 160)}`);
    assert(!/connect-src[^;]*\shttps:(\s|;|$)/.test(csp), "connect-src erlaubt pauschal https:");
    assert(!csp.includes("style-src 'self' 'unsafe-inline'"), "style-src erlaubt weiterhin inline-Bloecke");
  });
  // ── Medien (R-03) ─────────────────────────────────────────────────────────
  // Ohne `media-src` greift `default-src 'self'`, und der Player bliebe stumm –
  // ohne erkennbaren Netzwerkfehler, weil die CSP still blockiert.
  await check("CSP erlaubt Videos und Bilder aus der Medienablage", () => {
    const h = readFileSync("dist-kc/_headers", "utf8");
    const csp = h.split("\n").find(l => l.includes("Content-Security-Policy")) ?? "";
    const directive = (name) => (csp.match(new RegExp(`${name} ([^;]+)`)) ?? [])[1] ?? "";
    assert(directive("media-src").includes(SB), `media-src ohne Ablage: ${directive("media-src")}`);
    assert(directive("img-src").includes(SB), `img-src ohne Ablage: ${directive("img-src")}`);
    assert(directive("img-src").includes("blob:"), "img-src ohne blob: – die Vorschau vor dem Upload bricht");
  });
  await check("Medien-Direktiven bleiben eng gefasst", () => {
    const h = readFileSync("dist-kc/_headers", "utf8");
    const csp = h.split("\n").find(l => l.includes("Content-Security-Policy")) ?? "";
    assert(!/media-src[^;]*\shttps:(\s|;|$)/.test(csp), "media-src erlaubt pauschal https:");
    assert(!/img-src[^;]*\shttps:(\s|;|$)/.test(csp), "img-src erlaubt pauschal https:");
  });

  await check("Frame-Einbettung und Formularziele sind eng gefasst", () => {
    const h = readFileSync("dist-kc/_headers", "utf8");
    assert(h.includes("frame-ancestors 'none'"), "frame-ancestors fehlt");
    assert(h.includes("form-action 'self'"), "form-action zu weit");
    assert(h.includes("X-Content-Type-Options: nosniff"), "nosniff fehlt");
    assert(h.includes("Strict-Transport-Security"), "HSTS fehlt");
  });

  await new Promise(r => kcServer.listen(KC_PORT, r));
  const app = (await import("node:child_process")).spawn(
    "npx", ["vite", "preview", "--outDir", "dist-kc", "--port", String(APP_PORT), "--strictPort"],
    { stdio: "ignore" });
  // auf Bereitschaft warten
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(APP + "/", { signal: AbortSignal.timeout(2000) }); if (r.ok) break; } catch { /* weiter */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  let browser;
  try {
    browser = await chromium.launch({
      ...(CHROME ? { executablePath: CHROME } : {}),
      args: ["--no-sandbox"],
    });
  } catch (error) {
    console.error("\nBrowser konnte nicht gestartet werden.");
    console.error("Einmalig einrichten:  npx playwright install chromium\n");
    throw error;
  }
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    // Autorisierungs-Aufruf abfangen, statt ihn auszuführen
    let authorizeUrl = null;
    await page.route("**/protocol/openid-connect/auth*", route => {
      authorizeUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Keycloak-Anmeldeseite (Stub)</h1>" });
    });

    await page.goto(APP + "/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);

    // Erwartetes Verhalten: nicht angemeldete Aufrufe werden ohne Zwischenschritt
    // an Keycloak weitergeleitet – in der Anwendung gibt es keine Passwortabfrage.
    await check("Aufruf ohne Anmeldung leitet selbsttätig zu Keycloak", async () => {
      for (let i = 0; i < 20 && !authorizeUrl; i++) await page.waitForTimeout(300);
      assert(authorizeUrl, "keine Anfrage an den Autorisierungs-Endpunkt");
    });

    await check("Kein Demo-Formular und kein Passwortfeld in der Anwendung", async () => {
      const body = await page.locator("body").innerText();
      assert(!/Demo-Zugang/i.test(body), "Demo-Hinweis sichtbar");
      assert(await page.locator('input[type="password"]').count() === 0, "Passwortfeld vorhanden");
    });

    const q = authorizeUrl ? new URL(authorizeUrl).searchParams : new URLSearchParams();

    await check("client_id ist learning-platform", () =>
      assert(q.get("client_id") === "learning-platform", String(q.get("client_id"))));
    await check("response_type ist code (Authorization Code Flow)", () =>
      assert(q.get("response_type") === "code", String(q.get("response_type"))));
    await check("PKCE aktiv: code_challenge_method S256", () =>
      assert(q.get("code_challenge_method") === "S256" && !!q.get("code_challenge"),
        `${q.get("code_challenge_method")} / challenge=${!!q.get("code_challenge")}`));
    // Nur Scopes anfordern, die Keycloak selbst mitbringt. Ein eigener Scope
    // im Realm-Import würde die eingebauten unterdrücken – dann fehlte `roles`
    // im Token und sämtliche Rollenprüfungen liefen ins Leere.
    await check("scope: openid profile email, kein eigener Scope", () => {
      const s = q.get("scope") ?? "";
      assert(s.includes("openid") && s.includes("profile") && s.includes("email"), s);
      assert(!s.includes("academy"), `eigener Scope angefordert: ${s}`);
    });
    await check("redirect_uri zeigt auf /auth/callback", () =>
      assert((q.get("redirect_uri") ?? "").includes("/auth/callback"), String(q.get("redirect_uri"))));
    await check("state-Parameter gesetzt (Schutz gegen CSRF)", () =>
      assert(!!q.get("state"), "fehlt"));

    await check("Keine Tokens im localStorage", async () => {
      const keys = await page.evaluate(() => Object.keys(localStorage).join(","));
      assert(!/oidc|token|access|refresh/i.test(keys), keys);
    });

    // R-05: Produktiv wird nur Deutsch angeboten, solange die Kataloge fuer
    // Englisch und Franzoesisch unvollstaendig sind. Ein Umschalter mit einem
    // einzigen Eintrag verspricht eine Auswahl, die es nicht gibt.
    await check("Kein Sprachumschalter in der Produktionsvorgabe", async () => {
      await page.goto(APP + "/impressum", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(1200);
      const n = await page.locator("header").getByRole("button", { name: /Sprache|Language|Langue/i }).count();
      assert(n === 0, `Sprachumschalter sichtbar (${n} Treffer), obwohl nur Deutsch angeboten wird`);
    });

    await check("Öffentliche Seiten bleiben ohne Anmeldung erreichbar", async () => {
      for (const p of ["/impressum", "/datenschutz"]) {
        await page.goto(APP + p, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(600);
        const txt = await page.locator("body").innerText();
        assert(txt.length > 40 && !/Mit GroupIT-Konto/i.test(txt), `${p} nicht erreichbar`);
      }
    });

    await ctx.close();
  } finally {
    await browser.close();
    app.kill("SIGTERM");
    kcServer.close();
  }

  console.log(`\nErgebnis: ${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error("Testlauf abgebrochen:", e.message); process.exit(1); });
