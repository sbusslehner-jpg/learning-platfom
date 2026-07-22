// ============================================================
// Unit-Tests der SSO-Kernlogik.
//
// Ausführbar mit Node 22 (Web-Crypto + TS-Type-Stripping):
//   node --experimental-strip-types --test supabase/functions/_shared/sso.test.ts
//
// Diese Tests decken die sicherheitskritische Entscheidungslogik ab
// (Rollen-Mapping, Zielauflösung, Validierung, Timeout-Mathematik,
// Ticket-Fehlerklassifikation, Token-Erzeugung/Hashing). DB-Atomarität,
// Cookie-/Redirect-Verhalten und End-to-End sind hier NICHT abgedeckt
// (kein Postgres/Deno in dieser Umgebung).
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveExternalUserKey, generateOpaqueToken, sha256Hex, pseudonymize,
  validateLaunchRequest, mapRole, resolveTarget, targetToPath, resolveLocale,
  computeSessionExpiry, extendSession, errorForTicketClassification,
  validateClientAssertionClaims, DEFAULT_TIMEOUTS, type ClientConfig,
} from "./sso.ts";

const CFG: ClientConfig = {
  clientId: "serviceq-prod",
  allowedTenants: ["PHS_AT", "PHS_DE"],
  allowedRoles: ["trainer", "dealer_manager", "learner"], // Priorität hoch→niedrig
  allowedTargetTypes: ["home", "training", "learning_path"],
  defaultRole: "learner",
  denyUnknownRole: false,
  roleMap: {
    service_advisor: "learner",
    dealer_admin: "dealer_manager",
    market_trainer: "trainer",
  },
};

// ─── Benutzerschlüssel ───────────────────────────────────────────────────────

test("deriveExternalUserKey bildet issuer:tenant:subject", () => {
  assert.equal(
    deriveExternalUserKey("serviceq", "PHS_AT", "8a68fd42"),
    "serviceq:PHS_AT:8a68fd42",
  );
});

// ─── Token & Hashing ─────────────────────────────────────────────────────────

test("generateOpaqueToken: url-safe, ausreichend lang, eindeutig", () => {
  const a = generateOpaqueToken();
  const b = generateOpaqueToken();
  assert.match(a, /^[A-Za-z0-9_-]+$/); // base64url, keine +/=
  assert.ok(a.length >= 43); // 32 Byte → ~43 Zeichen
  assert.notEqual(a, b);
});

test("sha256Hex: bekannter Vektor", async () => {
  // SHA-256("abc")
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("pseudonymize: stabil, gekürzt, kein Klartext", async () => {
  const p1 = await pseudonymize("serviceq:PHS_AT:u1");
  const p2 = await pseudonymize("serviceq:PHS_AT:u1");
  assert.equal(p1, p2);
  assert.equal(p1.length, 32);
  assert.doesNotMatch(p1, /u1/);
});

// ─── Validierung ─────────────────────────────────────────────────────────────

test("validateLaunchRequest: vollständig gültig", () => {
  const r = validateLaunchRequest(
    { issuer: "serviceq", subject: "u1", tenant: "PHS_AT", roles: ["service_advisor"], target: { type: "training", id: "serviceq-basics" } },
    CFG,
  );
  assert.deepEqual(r, { ok: true, errors: [] });
});

test("validateLaunchRequest: Pflichtfelder fehlen", () => {
  const r = validateLaunchRequest({}, CFG);
  assert.equal(r.ok, false);
  for (const f of ["missing:issuer", "missing:subject", "missing:tenant", "missing:roles", "missing:target"]) {
    assert.ok(r.errors.includes(f), `erwartet ${f}`);
  }
});

test("validateLaunchRequest: fremder Mandant wird abgewiesen", () => {
  const r = validateLaunchRequest(
    { issuer: "serviceq", subject: "u1", tenant: "FREMD", roles: ["service_advisor"], target: { type: "training", id: "x" } },
    CFG,
  );
  assert.ok(r.errors.includes("denied:tenant"));
});

test("validateLaunchRequest: falscher issuer und unerlaubter Zieltyp", () => {
  const r = validateLaunchRequest(
    { issuer: "evil", subject: "u1", tenant: "PHS_AT", roles: ["service_advisor"], target: { type: "admin_panel", id: "x" } },
    CFG,
  );
  assert.ok(r.errors.includes("invalid:issuer"));
  assert.ok(r.errors.includes("denied:target_type"));
});

// ─── Rollen-Mapping ──────────────────────────────────────────────────────────

test("mapRole: bekannte Rolle wird gemappt", () => {
  assert.equal(mapRole(["service_advisor"], CFG), "learner");
  assert.equal(mapRole(["dealer_admin"], CFG), "dealer_manager");
  assert.equal(mapRole(["market_trainer"], CFG), "trainer");
});

test("mapRole: höchste Rolle gewinnt", () => {
  assert.equal(mapRole(["service_advisor", "market_trainer"], CFG), "trainer");
});

test("mapRole: unbekannte Rolle → Default (denyUnknownRole=false)", () => {
  assert.equal(mapRole(["was_auch_immer"], CFG), "learner");
});

test("mapRole: unbekannte Rolle → Ablehnung (denyUnknownRole=true)", () => {
  const strict: ClientConfig = { ...CFG, denyUnknownRole: true };
  assert.equal(mapRole(["was_auch_immer"], strict), null);
});

test("mapRole: manipulierte Rolle eskaliert nicht (nur Mapping-Ziele zählen)", () => {
  // Angreifer schickt direkt eine Academy-Rolle statt einer ServiceQ-Rolle
  assert.equal(mapRole(["dealer_manager"], { ...CFG, denyUnknownRole: true }), null);
});

// ─── Zielauflösung ───────────────────────────────────────────────────────────

test("resolveTarget: freie URL wird abgelehnt (Open-Redirect-Schutz)", () => {
  assert.deepEqual(resolveTarget({ type: "training", id: "https://evil.example" }, CFG), { ok: false, reason: "url_not_allowed" });
});

test("resolveTarget: unerlaubter Typ abgelehnt, erlaubter zugelassen", () => {
  assert.equal(resolveTarget({ type: "admin", id: "x" }, CFG).ok, false);
  assert.deepEqual(resolveTarget({ type: "training", id: "serviceq-basics" }, CFG), { ok: true, type: "training", id: "serviceq-basics" });
});

test("targetToPath: interne Pfade", () => {
  assert.equal(targetToPath("home", "x"), "/");
  assert.equal(targetToPath("training", "serviceq-basics"), "/lernen/serviceq-basics");
  assert.equal(targetToPath("learning_path", "dsr"), "/katalog/dsr");
});

// ─── Locale ──────────────────────────────────────────────────────────────────

test("resolveLocale: exakt, Basis, Fallback", () => {
  const sup = ["de", "fr", "en"];
  assert.equal(resolveLocale("de-AT", sup, "en"), "de");
  assert.equal(resolveLocale("fr-BE", sup, "en"), "fr");
  assert.equal(resolveLocale("xx-YY", sup, "en"), "en");
  assert.equal(resolveLocale(undefined, sup, "en"), "en");
});

// ─── Session-Timeouts ────────────────────────────────────────────────────────

test("computeSessionExpiry: Idle gedeckelt durch Absolut, Warnung 5 min davor", () => {
  const now = 1_000_000_000_000;
  const e = computeSessionExpiry(now, DEFAULT_TIMEOUTS);
  assert.equal(e.idleExpiresAt, now + 30 * 60_000);
  assert.equal(e.absoluteExpiresAt, now + 12 * 3_600_000);
  assert.equal(e.warningAt, e.idleExpiresAt - 5 * 60_000);
});

test("computeSessionExpiry: kurz vor Absolut wird Idle gekappt", () => {
  const now = 0;
  const e = computeSessionExpiry(now, { idleMinutes: 30, absoluteHours: 0.25, warningMinutes: 5 }); // absolut 15 min
  assert.equal(e.absoluteExpiresAt, 15 * 60_000);
  assert.equal(e.idleExpiresAt, 15 * 60_000); // Idle (30) auf Absolut (15) gekappt
});

test("extendSession: verlängert bei Aktivität, gedeckelt", () => {
  const created = 0;
  const abs = created + 12 * 3_600_000;
  const now = created + 20 * 60_000;
  const r = extendSession(now, { absoluteExpiresAt: abs }, DEFAULT_TIMEOUTS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.idleExpiresAt, now + 30 * 60_000);
});

test("extendSession: nach absolutem Timeout keine Verlängerung", () => {
  const abs = 1000;
  const r = extendSession(2000, { absoluteExpiresAt: abs }, DEFAULT_TIMEOUTS);
  assert.deepEqual(r, { ok: false, code: "SESSION_ABSOLUTE_TIMEOUT" });
});

test("extendSession: Idle darf Absolut nicht überschreiten", () => {
  const abs = 1000 + 60_000; // 1 min nach now
  const now = 1000;
  const r = extendSession(now, { absoluteExpiresAt: abs }, DEFAULT_TIMEOUTS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.idleExpiresAt, abs); // auf Absolut gekappt
});

// ─── Client-Assertion-Claims (private_key_jwt) ───────────────────────────────

const NOW = 1_700_000_000;
const goodClaims = { iss: "serviceq-prod", sub: "serviceq-prod", aud: "https://academy.example.com/launch", exp: NOW + 120, nbf: NOW - 5, iat: NOW - 5, jti: "j-1" };
const opts = { clientId: "serviceq-prod", audience: "https://academy.example.com/launch", nowSeconds: NOW };

test("validateClientAssertionClaims: gültige Assertion", () => {
  assert.deepEqual(validateClientAssertionClaims(goodClaims, opts), { ok: true, errors: [] });
});

test("validateClientAssertionClaims: falscher issuer/subject", () => {
  const r = validateClientAssertionClaims({ ...goodClaims, iss: "evil", sub: "evil" }, opts);
  assert.ok(r.errors.includes("iss") && r.errors.includes("sub"));
});

test("validateClientAssertionClaims: falsche audience abgewiesen", () => {
  const r = validateClientAssertionClaims({ ...goodClaims, aud: "https://anderer.example" }, opts);
  assert.ok(r.errors.includes("aud"));
});

test("validateClientAssertionClaims: abgelaufen", () => {
  const r = validateClientAssertionClaims({ ...goodClaims, exp: NOW - 3600 }, opts);
  assert.ok(r.errors.includes("exp"));
});

test("validateClientAssertionClaims: zu alt / in der Zukunft ausgestellt", () => {
  assert.ok(validateClientAssertionClaims({ ...goodClaims, iat: NOW - 5000 }, opts).errors.includes("iat_too_old"));
  assert.ok(validateClientAssertionClaims({ ...goodClaims, iat: NOW + 5000 }, opts).errors.includes("iat_future"));
});

test("validateClientAssertionClaims: fehlendes jti (Replay-Schutz)", () => {
  const r = validateClientAssertionClaims({ ...goodClaims, jti: undefined }, opts);
  assert.ok(r.errors.includes("jti"));
});

test("validateClientAssertionClaims: aud als Array wird akzeptiert", () => {
  const r = validateClientAssertionClaims({ ...goodClaims, aud: ["x", "https://academy.example.com/launch"] }, opts);
  assert.equal(r.ok, true);
});

// ─── Ticket-Fehlerklassifikation ─────────────────────────────────────────────

test("errorForTicketClassification: HTTP-Status je Zustand", () => {
  assert.deepEqual(errorForTicketClassification("already_used"), { status: 409, code: "TICKET_ALREADY_USED" });
  assert.deepEqual(errorForTicketClassification("expired"), { status: 410, code: "TICKET_EXPIRED" });
  assert.deepEqual(errorForTicketClassification("not_found"), { status: 404, code: "TARGET_NOT_FOUND" });
});
