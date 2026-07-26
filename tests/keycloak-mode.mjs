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
import http from "node:http";

const CHROME = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const KC_PORT = 8099;
const APP_PORT = 4322;
const KC = `http://localhost:${KC_PORT}`;
const APP = `http://localhost:${APP_PORT}`;

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
    },
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

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
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
    await check("scope enthält openid und academy", () => {
      const s = q.get("scope") ?? "";
      assert(s.includes("openid") && s.includes("academy"), s);
    });
    await check("redirect_uri zeigt auf /auth/callback", () =>
      assert((q.get("redirect_uri") ?? "").includes("/auth/callback"), String(q.get("redirect_uri"))));
    await check("state-Parameter gesetzt (Schutz gegen CSRF)", () =>
      assert(!!q.get("state"), "fehlt"));

    await check("Keine Tokens im localStorage", async () => {
      const keys = await page.evaluate(() => Object.keys(localStorage).join(","));
      assert(!/oidc|token|access|refresh/i.test(keys), keys);
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
