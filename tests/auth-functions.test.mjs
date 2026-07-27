// ============================================================
// Tests für die serverseitigen Auth-Funktionen.
//
//   node --test tests/auth-functions.test.mjs
//
// Es läuft ein echter HTTP-Server (node:http) auf einem freien Port, der
// Keycloak UND die Supabase-REST-API nachbildet. Die Handler werden per
// dynamischem import() geladen, NACHDEM die Umgebungsvariablen auf diesen
// Server zeigen – nur so greifen die Modul-Caches (JWKS, Service-Token)
// gegen den Mock.
//
// Schwerpunkt der Tests sind die Sicherheitsprüfungen: Signatur, Issuer,
// Client (azp/aud), Adminrolle, Rollen-Allowlist und die kompensierende
// Löschung bei halb angelegten Konten.
// ============================================================

import test, { after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";

// ── Schlüsselmaterial ────────────────────────────────────────────────────────
// Schlüsselpaar 1 landet in der JWKS des Mocks – nur damit signierte Tokens
// dürfen akzeptiert werden. Paar 2 ist der Angreifer-Schlüssel.
const realm = "serviceq";
const trusted = await generateKeyPair("RS256", { extractable: true });
const attacker = await generateKeyPair("RS256", { extractable: true });

const trustedJwk = { ...(await exportJWK(trusted.publicKey)), kid: "trusted-1", alg: "RS256", use: "sig" };

const SUPABASE_JWT_SECRET = "test-supabase-jwt-secret-mit-ausreichender-laenge-0123456789";
const APP_USER_ID = "3f6b1c2e-9f0a-4d1b-8f2a-77a6c1b0e4d5";
const NEW_KEYCLOAK_USER_ID = "b1d9a7c4-0e52-4a83-9c11-2f5d6e7a8b90";

// ── Mock-Zustand ─────────────────────────────────────────────────────────────
const mock = {
  calls: [],
  createUserStatus: 201,
  roleMappingStatus: 204,
  executeActionsStatus: 204,
  rolesKnown: new Set(["admin", "editor", "user"]),
  usersByEmail: new Map(),
  supabaseAppUserStatus: 201,
  markets: [
    { id: "11111111-1111-4111-8111-111111111111", code: "DE" },
    { id: "22222222-2222-4222-8222-222222222222", code: "AT" },
  ],
  // Mail-Einstellungen im Realm (admin-smtp)
  smtpServer: { host: "mailpit", port: "1025", from: "noreply@groupit.example", auth: "false" },
  realmUpdateStatus: 204,
  smtpTestStatus: 204,
};

function record(entry) {
  mock.calls.push(entry);
}

function callsTo(method, pathFragment) {
  return mock.calls.filter((c) => c.method === method && c.path.includes(pathFragment));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload, headers = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const rawBody = await readBody(req);
  let body = null;
  if (rawBody !== "") {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }
  record({ method, path, query: Object.fromEntries(url.searchParams), body });

  // ── Keycloak: JWKS ────────────────────────────────────────────────────────
  if (path === `/realms/${realm}/protocol/openid-connect/certs`) {
    return sendJson(res, 200, { keys: [trustedJwk] });
  }

  // ── Keycloak: Service-Account-Token (client_credentials) ──────────────────
  if (path === `/realms/${realm}/protocol/openid-connect/token`) {
    return sendJson(res, 200, {
      access_token: "service-account-access-token",
      token_type: "Bearer",
      expires_in: 60,
    });
  }

  // ── Keycloak Admin API ────────────────────────────────────────────────────
  const adminBase = `/admin/realms/${realm}`;
  if (path.startsWith(adminBase)) {
    const suffix = path.slice(adminBase.length);

    // Rollenrepräsentation
    const roleMatch = /^\/roles\/([^/]+)$/.exec(suffix);
    if (method === "GET" && roleMatch) {
      const name = decodeURIComponent(roleMatch[1]);
      if (!mock.rolesKnown.has(name)) return sendJson(res, 404, { error: "role not found" });
      return sendJson(res, 200, { id: `role-id-${name}`, name, composite: false, clientRole: false });
    }

    // Rollen-Mapping
    if (method === "POST" && /^\/users\/[^/]+\/role-mappings\/realm$/.test(suffix)) {
      if (mock.roleMappingStatus >= 400) return sendJson(res, mock.roleMappingStatus, { error: "nope" });
      res.writeHead(mock.roleMappingStatus);
      return res.end();
    }

    // Einladungs-E-Mail
    if (method === "PUT" && /^\/users\/[^/]+\/execute-actions-email$/.test(suffix)) {
      if (mock.executeActionsStatus >= 400) {
        return sendJson(res, mock.executeActionsStatus, { error: "smtp down" });
      }
      res.writeHead(mock.executeActionsStatus);
      return res.end();
    }

    // Kompensierende Löschung
    if (method === "DELETE" && /^\/users\/[^/]+$/.test(suffix)) {
      res.writeHead(204);
      return res.end();
    }

    // Benutzer anlegen
    if (method === "POST" && suffix === "/users") {
      if (mock.createUserStatus === 409) {
        return sendJson(res, 409, { errorMessage: "User exists with same username" });
      }
      res.writeHead(mock.createUserStatus, {
        Location: `http://127.0.0.1/admin/realms/${realm}/users/${NEW_KEYCLOAK_USER_ID}`,
      });
      return res.end();
    }

    // Benutzersuche (resend)
    if (method === "GET" && suffix === "/users") {
      const email = (url.searchParams.get("email") ?? "").toLowerCase();
      const exact = url.searchParams.get("exact") === "true";
      const hit = exact ? mock.usersByEmail.get(email) : undefined;
      return sendJson(res, 200, hit ? [hit] : []);
    }

    // Realm-Darstellung: lesen und schreiben (Mail-Einstellungen)
    if (suffix === "") {
      if (method === "GET") {
        return sendJson(res, 200, { realm, displayName: "ServiceQ", smtpServer: mock.smtpServer });
      }
      if (method === "PUT") {
        if (mock.realmUpdateStatus >= 400) {
          return sendJson(res, mock.realmUpdateStatus, { error: "denied" });
        }
        if (body?.smtpServer) mock.smtpServer = body.smtpServer;
        res.writeHead(mock.realmUpdateStatus);
        return res.end();
      }
    }

    // Verbindungstest des Mailservers
    if (method === "POST" && suffix === "/testSMTPConnection") {
      if (mock.smtpTestStatus >= 400) {
        return sendJson(res, mock.smtpTestStatus, { errorMessage: "Connection refused" });
      }
      res.writeHead(mock.smtpTestStatus);
      return res.end();
    }

    return sendJson(res, 404, { error: "unhandled admin route", suffix, method });
  }

  // ── Supabase REST ─────────────────────────────────────────────────────────
  if (path === "/rest/v1/app_user") {
    if (mock.supabaseAppUserStatus >= 400) {
      return sendJson(res, mock.supabaseAppUserStatus, { code: "42501", message: "denied" });
    }
    const activeFlag = mock.appUserActive;
    if (method === "POST") return sendJson(res, 201, [{ id: APP_USER_ID, active: activeFlag }]);
    if (method === "PATCH") return sendJson(res, 200, [{ id: APP_USER_ID, active: activeFlag }]);
    if (method === "GET") return sendJson(res, 200, []);
  }
  if (path === "/rest/v1/user_role_assignment" || path === "/rest/v1/user_market") {
    res.writeHead(201, { "Content-Type": "application/json" });
    return res.end("[]");
  }
  if (path === "/rest/v1/market") {
    const filter = url.searchParams.get("code") ?? "";
    const inMatch = /^in\.\(([^)]*)\)$/.exec(filter);
    const wanted = inMatch ? inMatch[1].split(",") : [];
    return sendJson(res, 200, mock.markets.filter((m) => wanted.includes(m.code)));
  }

  return sendJson(res, 404, { error: "unhandled route", path, method });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

// ── Umgebung VOR dem Import der Handler setzen ────────────────────────────────
process.env.KEYCLOAK_URL = baseUrl;
process.env.KEYCLOAK_REALM = realm;
process.env.KEYCLOAK_BACKEND_CLIENT_ID = "platform-backend";
process.env.KEYCLOAK_BACKEND_CLIENT_SECRET = "test-backend-client-secret";
process.env.SUPABASE_URL = baseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SUPABASE_JWT_SECRET = SUPABASE_JWT_SECRET;
process.env.PLATFORM_URL = "https://lernen.example.com";

const { handler: exchangeHandler } = await import("../netlify/functions/auth-exchange.mjs");
const { handler: inviteHandler } = await import("../netlify/functions/admin-invite.mjs");
const { handler: smtpHandler } = await import("../netlify/functions/admin-smtp.mjs");

after(() => {
  server.closeAllConnections?.();
  server.close();
});

beforeEach(() => {
  mock.calls = [];
  mock.createUserStatus = 201;
  mock.roleMappingStatus = 204;
  mock.executeActionsStatus = 204;
  mock.supabaseAppUserStatus = 201;
  mock.appUserActive = true;
  mock.rolesKnown = new Set(["admin", "editor", "user"]);
  mock.usersByEmail = new Map();
  mock.smtpServer = { host: "mailpit", port: "1025", from: "noreply@groupit.example", auth: "false" };
  mock.realmUpdateStatus = 204;
  mock.smtpTestStatus = 204;
});

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────
const NOW = () => Math.floor(Date.now() / 1000);

async function mintToken({
  key = trusted.privateKey,
  kid = "trusted-1",
  issuer = `${baseUrl}/realms/${realm}`,
  azp = "learning-platform",
  aud = ["account"],
  roles = ["user"],
  sub = "kc-sub-0001",
  email = "lisa.lernende@example.com",
  name = "Lisa Lernende",
  markets = "DE,AT",
  tenant = "PHS_AT",
  typ = "Bearer",
  ttlSeconds = 300,
  omit = [],
} = {}) {
  const claims = {
    typ,
    azp,
    realm_access: { roles },
    email,
    preferred_username: email,
    name,
    markets,
    tenant,
  };
  for (const field of omit) delete claims[field];

  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt(NOW())
    .setExpirationTime(NOW() + ttlSeconds);
  return jwt.sign(key);
}

function eventFor(token, { method = "POST", path = "/api/auth/exchange", body } = {}) {
  return {
    httpMethod: method,
    path,
    rawUrl: `https://lernen.example.com${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function parse(response) {
  return JSON.parse(response.body);
}

const VALID_INVITE = {
  email: "Neu.Kollege@Example.com",
  firstName: "Neu",
  lastName: "Kollege",
  roles: ["editor", "user"],
  markets: ["DE", "at"],
  tenant: "PHS_AT",
  locale: "de",
};

// ============================================================================
// 1. Austausch: gültiges Token
// ============================================================================
describe("POST /api/auth/exchange", () => {
  test("gültiges Token → 200 mit verifizierbarem Supabase-JWT", async () => {
    const kcExp = NOW() + 300;
    const token = await mintToken({ roles: ["admin", "user", "offline_access"], ttlSeconds: 300 });
    const response = await exchangeHandler(eventFor(token));

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");

    const payload = parse(response);
    assert.equal(payload.provisioned, true);
    assert.deepEqual(payload.profile, {
      name: "Lisa Lernende",
      email: "lisa.lernende@example.com",
      roles: ["admin", "user"], // `offline_access` wurde verworfen (Allowlist)
      markets: ["DE", "AT"],
      tenant: "PHS_AT",
    });

    // Das ausgestellte Token muss mit dem Supabase-Secret verifizierbar sein.
    const { payload: claims, protectedHeader } = await jwtVerify(
      payload.token,
      new TextEncoder().encode(SUPABASE_JWT_SECRET),
      { issuer: "keycloak-exchange", audience: "authenticated" },
    );
    assert.equal(protectedHeader.alg, "HS256");
    assert.equal(claims.role, "authenticated");
    assert.equal(claims.sub, APP_USER_ID, "sub muss die app_user-UUID sein (RLS auth.uid())");
    assert.equal(claims.keycloak_sub, "kc-sub-0001");
    assert.deepEqual(claims.academy_roles, ["admin", "user"]);
    assert.deepEqual(claims.markets, ["DE", "AT"]);
    assert.equal(claims.tenant, "PHS_AT");
    assert.equal(claims.email, "lisa.lernende@example.com");

    // Niemals länger gültig als das Keycloak-Token.
    assert.ok(claims.exp <= kcExp + 2, `exp ${claims.exp} darf ${kcExp} nicht überschreiten`);
    assert.ok(claims.exp > NOW(), "Token muss in der Zukunft ablaufen");
    assert.equal(payload.expiresAt, new Date(claims.exp * 1000).toISOString());

    // app_user wurde gespiegelt (issuer/tenant/subject, kein `active`).
    const upserts = callsTo("POST", "/rest/v1/app_user");
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].query.on_conflict, "issuer,tenant,subject");
    assert.deepEqual(upserts[0].body, [
      {
        issuer: "keycloak",
        tenant: "PHS_AT",
        subject: "kc-sub-0001",
        name: "Lisa Lernende",
        email: "lisa.lernende@example.com",
      },
    ]);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(upserts[0].body[0], "active"),
      "Anmeldung darf ein deaktiviertes Konto nicht reaktivieren",
    );
  });

  test("15-Minuten-Deckel greift bei langlebigem Keycloak-Token", async () => {
    const token = await mintToken({ ttlSeconds: 3600 });
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 200);
    const { payload: claims } = await jwtVerify(
      parse(response).token,
      new TextEncoder().encode(SUPABASE_JWT_SECRET),
    );
    const ttl = claims.exp - claims.iat;
    assert.ok(ttl <= 900, `TTL ${ttl}s darf 900s nicht überschreiten`);
    assert.ok(ttl >= 880, `TTL ${ttl}s sollte nahe 900s liegen`);
  });

  test("Provisionierungsfehler → 200 mit provisioned:false, Login bleibt möglich", async () => {
    mock.supabaseAppUserStatus = 500;
    const token = await mintToken();
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 200);
    const payload = parse(response);
    assert.equal(payload.provisioned, false);
    assert.ok(typeof payload.message === "string" && payload.message.length > 0);
    const { payload: claims } = await jwtVerify(
      payload.token,
      new TextEncoder().encode(SUPABASE_JWT_SECRET),
    );
    // Rückfallebene: Keycloak-sub, damit RLS-Abfragen gezielt LEER laufen.
    assert.equal(claims.sub, "kc-sub-0001");
    assert.equal(claims.keycloak_sub, "kc-sub-0001");
  });

  // ==========================================================================
  // 2. Austausch: alle Ablehnungspfade
  // ==========================================================================
  test("fehlender Authorization-Header → 401 INVALID_TOKEN", async () => {
    const response = await exchangeHandler(eventFor(null));
    assert.equal(response.statusCode, 401);
    assert.equal(parse(response).code, "INVALID_TOKEN");
  });

  test("fehlgeformter Authorization-Header → 401 INVALID_TOKEN", async () => {
    for (const value of ["", "Basic abc", "Bearer", "Bearer  ", "Bearer nur-ein-segment"]) {
      const response = await exchangeHandler({
        httpMethod: "POST",
        path: "/api/auth/exchange",
        headers: { authorization: value },
        body: null,
      });
      assert.equal(response.statusCode, 401, `Header "${value}" muss abgelehnt werden`);
      assert.equal(parse(response).code, "INVALID_TOKEN");
    }
  });

  test("Token mit FREMDEM Schlüssel signiert → 401", async () => {
    const token = await mintToken({ key: attacker.privateKey, kid: "trusted-1" });
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 401);
    assert.equal(parse(response).code, "INVALID_TOKEN");
  });

  test("Token mit unbekannter kid → 401", async () => {
    const token = await mintToken({ key: attacker.privateKey, kid: "angreifer-1" });
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 401);
  });

  test("Token mit falschem Issuer → 401", async () => {
    const token = await mintToken({ issuer: "https://evil.example.com/realms/serviceq" });
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 401);
    assert.equal(parse(response).code, "INVALID_TOKEN");
  });

  test("Token für falschen Realm → 401", async () => {
    const token = await mintToken({ issuer: `${baseUrl}/realms/anderer-realm` });
    assert.equal((await exchangeHandler(eventFor(token))).statusCode, 401);
  });

  test("Token eines ANDEREN Clients (azp/aud) → 401", async () => {
    const token = await mintToken({ azp: "anderer-client", aud: ["account", "anderer-client"] });
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 401);
    assert.equal(parse(response).code, "INVALID_TOKEN");
  });

  test("Client nur über aud statt azp → akzeptiert", async () => {
    const token = await mintToken({ azp: "anderer-client", aud: ["learning-platform"] });
    assert.equal((await exchangeHandler(eventFor(token))).statusCode, 200);
  });

  test("abgelaufenes Token → 401", async () => {
    const token = await mintToken({ ttlSeconds: -60 });
    assert.equal((await exchangeHandler(eventFor(token))).statusCode, 401);
  });

  test("ID-Token (typ=ID) statt Access Token → 401", async () => {
    const token = await mintToken({ typ: "ID" });
    const response = await exchangeHandler(eventFor(token));
    assert.equal(response.statusCode, 401);
    assert.equal(parse(response).code, "INVALID_TOKEN");
  });

  // ==========================================================================
  // 9. Falsche Methode
  // ==========================================================================
  test("GET → 405", async () => {
    const token = await mintToken();
    const response = await exchangeHandler(eventFor(token, { method: "GET" }));
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, "POST");
    assert.equal(parse(response).code, "METHOD_NOT_ALLOWED");
  });
});

// ============================================================================
// 3.–7. Einladung
// ============================================================================
describe("POST /api/admin/invite", () => {
  const invitePath = "/api/admin/invite";

  test("Aufrufer ohne Adminrolle → 403 FORBIDDEN und KEIN Keycloak-Seiteneffekt", async () => {
    for (const roles of [["user"], ["editor"], ["editor", "user"], []]) {
      mock.calls = [];
      const token = await mintToken({ roles });
      const response = await inviteHandler(
        eventFor(token, { path: invitePath, body: VALID_INVITE }),
      );
      assert.equal(response.statusCode, 403, `Rollen ${JSON.stringify(roles)} dürfen nicht genügen`);
      assert.equal(parse(response).code, "FORBIDDEN");
      assert.equal(callsTo("POST", "/users").length, 0, "kein Benutzer angelegt");
      assert.equal(
        mock.calls.filter((c) => c.path.includes("/protocol/openid-connect/token")).length,
        0,
        "kein Service-Account-Token angefordert",
      );
    }
  });

  test("Aufrufer ohne Token → 401, nicht 403", async () => {
    const response = await inviteHandler({
      httpMethod: "POST",
      path: invitePath,
      headers: {},
      body: JSON.stringify(VALID_INVITE),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(parse(response).code, "INVALID_TOKEN");
    assert.equal(callsTo("POST", "/users").length, 0);
  });

  test("gefälschtes Admin-Token (fremder Schlüssel) → 401", async () => {
    const token = await mintToken({ key: attacker.privateKey, roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );
    assert.equal(response.statusCode, 401);
    assert.equal(callsTo("POST", "/users").length, 0);
  });

  test("gültiger Admin-Aufruf → 201, Keycloak erhält alle drei Aufrufe", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.headers["Cache-Control"], "no-store");
    const payload = parse(response);
    assert.equal(payload.userId, NEW_KEYCLOAK_USER_ID);
    assert.equal(payload.emailSent, true);
    assert.equal(payload.provisioned, true);

    // ── 1. Benutzeranlage ───────────────────────────────────────────────────
    const creates = callsTo("POST", `/admin/realms/${realm}/users`).filter(
      (c) => c.path.endsWith("/users"),
    );
    assert.equal(creates.length, 1);
    const created = creates[0].body;
    assert.equal(created.username, "neu.kollege@example.com", "E-Mail normalisiert (lowercase)");
    assert.equal(created.email, "neu.kollege@example.com");
    assert.equal(created.firstName, "Neu");
    assert.equal(created.lastName, "Kollege");
    assert.equal(created.enabled, true);
    assert.equal(created.emailVerified, false, "E-Mail darf nicht als verifiziert gelten");
    assert.deepEqual(created.attributes.markets, ["DE,AT"], "Märkte als Komma-Liste, normalisiert");
    assert.deepEqual(created.attributes.tenant, ["PHS_AT"]);
    assert.deepEqual(created.attributes.locale, ["de"]);
    assert.ok(
      !Object.prototype.hasOwnProperty.call(created, "credentials"),
      "es darf kein Initialpasswort gesetzt werden",
    );

    // ── 2. Rollen-Mapping ───────────────────────────────────────────────────
    const mappings = callsTo("POST", "/role-mappings/realm");
    assert.equal(mappings.length, 1);
    assert.ok(mappings[0].path.includes(NEW_KEYCLOAK_USER_ID));
    assert.deepEqual(mappings[0].body, [
      { id: "role-id-editor", name: "editor" },
      { id: "role-id-user", name: "user" },
    ]);

    // ── 3. Einladungs-E-Mail ────────────────────────────────────────────────
    const emails = callsTo("PUT", "/execute-actions-email");
    assert.equal(emails.length, 1);
    assert.deepEqual(emails[0].body, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]);
    assert.equal(emails[0].query.client_id, "learning-platform");
    assert.equal(emails[0].query.lifespan, "259200", "3 Tage Gültigkeit");
    assert.equal(emails[0].query.redirect_uri, "https://lernen.example.com");

    // ── 4. Supabase-Spiegelung ──────────────────────────────────────────────
    const appUser = callsTo("POST", "/rest/v1/app_user");
    assert.equal(appUser.length, 1);
    assert.deepEqual(appUser[0].body, [
      {
        issuer: "keycloak",
        tenant: "PHS_AT",
        subject: NEW_KEYCLOAK_USER_ID,
        name: "Neu Kollege",
        email: "neu.kollege@example.com",
        active: true,
      },
    ]);
    const roleRows = callsTo("POST", "/rest/v1/user_role_assignment");
    assert.equal(roleRows.length, 1);
    assert.deepEqual(roleRows[0].body, [
      { user_id: APP_USER_ID, role: "editor" },
      { user_id: APP_USER_ID, role: "user" },
    ]);
    const marketRows = callsTo("POST", "/rest/v1/user_market");
    assert.equal(marketRows.length, 1);
    assert.equal(marketRows[0].body.length, 2);

    // Keine kompensierende Löschung im Erfolgsfall.
    assert.equal(callsTo("DELETE", "/users/").length, 0);
  });

  test("Rollen und Märkte werden dedupliziert und normalisiert", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, {
        path: invitePath,
        body: { ...VALID_INVITE, roles: ["user", "editor", "user"], markets: ["de", "DE", "at"] },
      }),
    );
    assert.equal(response.statusCode, 201);

    // Reihenfolge der Allowlist, jede Rolle genau einmal.
    const mappings = callsTo("POST", "/role-mappings/realm");
    assert.equal(mappings.length, 1);
    assert.deepEqual(mappings[0].body, [
      { id: "role-id-editor", name: "editor" },
      { id: "role-id-user", name: "user" },
    ]);

    const creates = callsTo("POST", `/admin/realms/${realm}/users`).filter((c) =>
      c.path.endsWith("/users"),
    );
    assert.deepEqual(creates[0].body.attributes.markets, ["DE,AT"]);
  });

  test("ungültige Eingaben → 400 mit details, KEIN Keycloak-Aufruf", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const cases = [
      { name: "kaputte E-Mail", body: { ...VALID_INVITE, email: "keine-email" }, fields: ["email"] },
      { name: "E-Mail fehlt", body: { ...VALID_INVITE, email: undefined }, fields: ["email"] },
      { name: "leere Rollenliste", body: { ...VALID_INVITE, roles: [] }, fields: ["roles"] },
      { name: "roles fehlt", body: { ...VALID_INVITE, roles: undefined }, fields: ["roles"] },
      {
        name: "unbekannte Rolle superadmin",
        body: { ...VALID_INVITE, roles: ["user", "superadmin"] },
        fields: ["roles"],
      },
      {
        name: "Keycloak-Realm-Rolle als Rolle",
        body: { ...VALID_INVITE, roles: ["realm-admin"] },
        fields: ["roles"],
      },
      { name: "roles kein Array", body: { ...VALID_INVITE, roles: "admin" }, fields: ["roles"] },
      { name: "Vorname fehlt", body: { ...VALID_INVITE, firstName: "  " }, fields: ["firstName"] },
      {
        name: "Nachname zu lang",
        body: { ...VALID_INVITE, lastName: "x".repeat(101) },
        fields: ["lastName"],
      },
      {
        name: "Marktcode zu lang",
        body: { ...VALID_INVITE, markets: ["DEUTSCHLAND"] },
        fields: ["markets"],
      },
      { name: "Sprache unbekannt", body: { ...VALID_INVITE, locale: "it" }, fields: ["locale"] },
      {
        name: "mehrere Felder",
        body: { email: "x", firstName: "", lastName: "", roles: ["nope"] },
        fields: ["email", "firstName", "lastName", "roles"],
      },
    ];

    for (const testCase of cases) {
      mock.calls = [];
      const response = await inviteHandler(
        eventFor(token, { path: invitePath, body: testCase.body }),
      );
      assert.equal(response.statusCode, 400, `${testCase.name} muss 400 ergeben`);
      const payload = parse(response);
      assert.equal(payload.code, "INVALID_INPUT");
      assert.ok(Array.isArray(payload.details) && payload.details.length > 0);
      const fields = payload.details.map((d) => d.field);
      for (const expected of testCase.fields) {
        assert.ok(
          fields.includes(expected),
          `${testCase.name}: details muss "${expected}" nennen, enthielt ${JSON.stringify(fields)}`,
        );
      }
      assert.equal(
        callsTo("POST", "/users").length,
        0,
        `${testCase.name}: es darf kein Benutzer angelegt werden`,
      );
      assert.equal(mock.calls.length, 0, `${testCase.name}: kein ausgehender Aufruf überhaupt`);
    }
  });

  test("fehlender Body → 400", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler({
      httpMethod: "POST",
      path: invitePath,
      headers: { authorization: `Bearer ${token}` },
      body: null,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(parse(response).code, "INVALID_INPUT");
    assert.equal(callsTo("POST", "/users").length, 0);
  });

  test("Keycloak antwortet 409 → 409 USER_EXISTS", async () => {
    mock.createUserStatus = 409;
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );
    assert.equal(response.statusCode, 409);
    const payload = parse(response);
    assert.equal(payload.code, "USER_EXISTS");
    assert.ok(payload.message.length > 0);
    assert.equal(callsTo("POST", "/role-mappings/realm").length, 0);
    assert.equal(callsTo("PUT", "/execute-actions-email").length, 0);
  });

  test("Rollenzuweisung scheitert → kompensierendes DELETE, 500", async () => {
    mock.roleMappingStatus = 500;
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );

    assert.equal(response.statusCode, 500);
    const payload = parse(response);
    assert.equal(payload.code, "ROLE_ASSIGNMENT_FAILED");
    assert.equal(payload.rolledBack, true);

    const deletes = callsTo("DELETE", `/admin/realms/${realm}/users/`);
    assert.equal(deletes.length, 1, "der angelegte Benutzer muss wieder entfernt werden");
    assert.ok(deletes[0].path.endsWith(NEW_KEYCLOAK_USER_ID));
    // Keine Einladung für ein Konto, das es nicht mehr gibt.
    assert.equal(callsTo("PUT", "/execute-actions-email").length, 0);
  });

  test("Rollenrepräsentation nicht auffindbar → kompensierendes DELETE, 500", async () => {
    mock.rolesKnown = new Set(["admin"]); // editor/user fehlen
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );
    assert.equal(response.statusCode, 500);
    assert.equal(parse(response).code, "ROLE_ASSIGNMENT_FAILED");
    assert.equal(callsTo("DELETE", `/admin/realms/${realm}/users/`).length, 1);
    assert.equal(callsTo("POST", "/role-mappings/realm").length, 0);
  });

  test("E-Mail-Versand scheitert → 201 mit emailSent:false, Konto bleibt bestehen", async () => {
    mock.executeActionsStatus = 500;
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );
    assert.equal(response.statusCode, 201);
    const payload = parse(response);
    assert.equal(payload.emailSent, false);
    assert.match(payload.message, /resend/);
    assert.equal(callsTo("DELETE", "/users/").length, 0, "Konto ist korrekt – nicht löschen");
  });

  test("Supabase-Spiegelung scheitert → 201 mit provisioned:false", async () => {
    mock.supabaseAppUserStatus = 500;
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: invitePath, body: VALID_INVITE }),
    );
    assert.equal(response.statusCode, 201);
    const payload = parse(response);
    assert.equal(payload.provisioned, false);
    assert.equal(payload.emailSent, true);
    assert.equal(payload.userId, NEW_KEYCLOAK_USER_ID);
    assert.equal(callsTo("DELETE", "/users/").length, 0);
  });

  test("GET → 405", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { method: "GET", path: invitePath, body: VALID_INVITE }),
    );
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, "POST");
    assert.equal(mock.calls.length, 0);
  });
});

// ============================================================================
// 8. Einladung erneut senden
// ============================================================================
describe("POST /api/admin/invite/resend", () => {
  const resendPath = "/api/admin/invite/resend";

  test("unbekannte E-Mail → 404 USER_NOT_FOUND", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: resendPath, body: { email: "unbekannt@example.com" } }),
    );
    assert.equal(response.statusCode, 404);
    assert.equal(parse(response).code, "USER_NOT_FOUND");
    assert.equal(callsTo("PUT", "/execute-actions-email").length, 0);
  });

  test("bekannte E-Mail → execute-actions-email erneut gesendet", async () => {
    mock.usersByEmail.set("bekannt@example.com", {
      id: NEW_KEYCLOAK_USER_ID,
      email: "bekannt@example.com",
    });
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: resendPath, body: { email: " Bekannt@Example.com " } }),
    );

    assert.equal(response.statusCode, 200);
    const payload = parse(response);
    assert.equal(payload.userId, NEW_KEYCLOAK_USER_ID);
    assert.equal(payload.emailSent, true);

    const lookups = mock.calls.filter((c) => c.method === "GET" && c.path.endsWith("/users"));
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].query.exact, "true", "Teiltreffer würden fremde Konten treffen");
    assert.equal(lookups[0].query.email, "bekannt@example.com");

    const emails = callsTo("PUT", "/execute-actions-email");
    assert.equal(emails.length, 1);
    assert.deepEqual(emails[0].body, ["UPDATE_PASSWORD", "VERIFY_EMAIL"]);
    assert.equal(emails[0].query.lifespan, "259200");

    // Der Resend-Pfad darf niemals einen Benutzer anlegen.
    assert.equal(callsTo("POST", `/admin/realms/${realm}/users`).length, 0);
  });

  test("Resend ohne Adminrolle → 403, keine Suche und kein Versand", async () => {
    const token = await mintToken({ roles: ["editor"] });
    const response = await inviteHandler(
      eventFor(token, { path: resendPath, body: { email: "bekannt@example.com" } }),
    );
    assert.equal(response.statusCode, 403);
    assert.equal(parse(response).code, "FORBIDDEN");
    assert.equal(mock.calls.length, 0);
  });

  test("Resend mit ungültiger E-Mail → 400", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler(
      eventFor(token, { path: resendPath, body: { email: "nope" } }),
    );
    assert.equal(response.statusCode, 400);
    assert.deepEqual(
      parse(response).details.map((d) => d.field),
      ["email"],
    );
    assert.equal(mock.calls.length, 0);
  });

  test("Resend-Route wird auch über rawUrl erkannt", async () => {
    mock.usersByEmail.set("bekannt@example.com", { id: NEW_KEYCLOAK_USER_ID });
    const token = await mintToken({ roles: ["admin"] });
    const response = await inviteHandler({
      httpMethod: "POST",
      // Netlify kann als `path` den Funktionspfad liefern; der Originalpfad
      // steckt dann in rawUrl bzw. x-nf-original-path.
      path: "/.netlify/functions/admin-invite",
      rawUrl: "https://lernen.example.com/api/admin/invite/resend",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "bekannt@example.com" }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(callsTo("PUT", "/execute-actions-email").length, 1);
    assert.equal(callsTo("POST", `/admin/realms/${realm}/users`).length, 0);
  });
});

// ── Deaktivierte Konten ──────────────────────────────────────────────────────
// Die Verwaltung kann Personen in der Plattform deaktivieren. Keycloak kennt
// dieses Flag nicht und stellt weiter Tokens aus – der Austausch muss den
// Zugriff daher verweigern, sonst wäre die Umschaltung wirkungslos.
test("Austausch: deaktiviertes Konto → 403 ACCOUNT_DISABLED", async () => {
  mock.appUserActive = false;
  const res = await exchangeHandler(eventFor(await mintToken({})));
  assert.equal(res.statusCode, 403);
  const body = parse(res);
  assert.equal(body.code, "ACCOUNT_DISABLED");
  assert.ok(!body.token, "es darf kein Token ausgestellt werden");
});

test("Austausch: aktives Konto erhält weiterhin ein Token", async () => {
  mock.appUserActive = true;
  const res = await exchangeHandler(eventFor(await mintToken({})));
  assert.equal(res.statusCode, 200);
  assert.ok(parse(res).token, "Token fehlt");
});

// ── Mail-Einstellungen (admin-smtp) ──────────────────────────────────────────
// Schwerpunkt: Adminpflicht, Schutz des Passworts und die Frage, wer den
// Empfänger des Testversands bestimmt.
describe("Mail-Einstellungen /api/admin/smtp", () => {
  const smtpEvent = (token, { method = "GET", path = "/api/admin/smtp", body } = {}) => ({
    httpMethod: method,
    path,
    rawUrl: `https://lernen.example.com${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
  });

  const VALID = {
    host: "smtp.example.net",
    port: "587",
    from: "noreply@example.net",
    fromDisplayName: "Lernplattform",
    encryption: "starttls",
    auth: true,
    user: "postfach",
    password: "geheim",
  };

  test("ohne Token abgewiesen", async () => {
    const response = await smtpHandler(smtpEvent(null));
    assert.equal(response.statusCode, 401);
    assert.equal(callsTo("GET", `/admin/realms/${realm}`).length, 0);
  });

  test("Lernender darf nicht lesen", async () => {
    const token = await mintToken({ roles: ["user", "editor"] });
    const response = await smtpHandler(smtpEvent(token));
    assert.equal(response.statusCode, 403);
    assert.equal(parse(response).code, "FORBIDDEN");
  });

  test("Lernender darf nicht schreiben", async () => {
    const token = await mintToken({ roles: ["editor"] });
    const response = await smtpHandler(smtpEvent(token, { method: "PUT", body: VALID }));
    assert.equal(response.statusCode, 403);
    assert.equal(callsTo("PUT", `/admin/realms/${realm}`).length, 0);
  });

  test("Admin liest die Einstellungen – ohne Passwort", async () => {
    mock.smtpServer = {
      host: "smtp.alt.example", port: "465", from: "alt@example.net",
      ssl: "true", starttls: "false", auth: "true", user: "konto", password: "streng-geheim",
    };
    const token = await mintToken({ roles: ["admin"] });
    const response = await smtpHandler(smtpEvent(token));
    assert.equal(response.statusCode, 200);
    const payload = parse(response);
    assert.equal(payload.host, "smtp.alt.example");
    assert.equal(payload.encryption, "ssl");
    assert.equal(payload.passwordSet, true);
    // Entscheidend: Der Wert darf die Funktion nicht verlassen.
    assert.equal(payload.password, undefined);
    assert.ok(!response.body.includes("streng-geheim"));
  });

  test("mailpit gilt nicht als eingerichtet", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const payload = parse(await smtpHandler(smtpEvent(token)));
    assert.equal(payload.configured, false);
  });

  test("Admin speichert – Werte landen im Realm", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await smtpHandler(smtpEvent(token, { method: "PUT", body: VALID }));
    assert.equal(response.statusCode, 200);
    assert.equal(mock.smtpServer.host, "smtp.example.net");
    assert.equal(mock.smtpServer.starttls, "true");
    assert.equal(mock.smtpServer.ssl, "false");
    assert.equal(mock.smtpServer.auth, "true");
    assert.equal(mock.smtpServer.password, "geheim");
    // Ohne eigene Antwortadresse auf den Absender zurückfallen
    assert.equal(mock.smtpServer.replyTo, "noreply@example.net");
  });

  test("Speichern ohne Passwort behält das hinterlegte", async () => {
    mock.smtpServer = { host: "alt", port: "25", from: "a@b.de", auth: "true", user: "u", password: "bestand" };
    const token = await mintToken({ roles: ["admin"] });
    const { password, ...ohnePasswort } = VALID;
    const response = await smtpHandler(smtpEvent(token, { method: "PUT", body: ohnePasswort }));
    assert.equal(response.statusCode, 200);
    assert.equal(mock.smtpServer.password, "bestand");
    assert.equal(mock.smtpServer.host, "smtp.example.net");
  });

  test("ungültige Eingaben werden abgewiesen, ohne Keycloak zu schreiben", async () => {
    const token = await mintToken({ roles: ["admin"] });
    for (const bad of [
      { ...VALID, host: "" },
      { ...VALID, port: "0" },
      { ...VALID, port: "70000" },
      { ...VALID, from: "keine-adresse" },
      { ...VALID, encryption: "unfug" },
      { ...VALID, auth: true, user: "" },
    ]) {
      const response = await smtpHandler(smtpEvent(token, { method: "PUT", body: bad }));
      assert.equal(response.statusCode, 400, JSON.stringify(bad));
    }
    assert.equal(callsTo("PUT", `/admin/realms/${realm}`).length, 0);
  });

  test("fehlendes manage-realm wird erklärt statt nur gemeldet", async () => {
    mock.realmUpdateStatus = 403;
    const token = await mintToken({ roles: ["admin"] });
    const response = await smtpHandler(smtpEvent(token, { method: "PUT", body: VALID }));
    assert.equal(response.statusCode, 502);
    assert.equal(parse(response).code, "KEYCLOAK_FORBIDDEN");
    assert.match(parse(response).message, /manage-realm/);
  });

  test("Testversand geht an das eigene Konto, nicht an eine übergebene Adresse", async () => {
    const token = await mintToken({ roles: ["admin"], email: "chefin@example.net" });
    const response = await smtpHandler(smtpEvent(token, {
      method: "POST",
      path: "/api/admin/smtp/test",
      body: { ...VALID, to: "opfer@fremde-domain.de" },
    }));
    assert.equal(response.statusCode, 200);
    assert.match(parse(response).message, /chefin@example\.net/);
    const call = callsTo("POST", "/testSMTPConnection")[0];
    assert.ok(call, "Testversand wurde nicht ausgelöst");
    // Die fremde Adresse darf nirgends auftauchen.
    assert.ok(!JSON.stringify(call.body).includes("opfer@fremde-domain.de"));
  });

  test("Fehlermeldung des Mailservers wird durchgereicht", async () => {
    mock.smtpTestStatus = 500;
    const token = await mintToken({ roles: ["admin"], email: "chefin@example.net" });
    const response = await smtpHandler(smtpEvent(token, {
      method: "POST", path: "/api/admin/smtp/test", body: VALID,
    }));
    assert.equal(response.statusCode, 400);
    assert.equal(parse(response).code, "SMTP_TEST_FAILED");
    assert.match(parse(response).message, /Connection refused/);
  });

  test("unbekannte POST-Route liefert 404", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await smtpHandler(smtpEvent(token, { method: "POST", path: "/api/admin/smtp", body: {} }));
    assert.equal(response.statusCode, 404);
  });

  test("DELETE ist nicht erlaubt", async () => {
    const token = await mintToken({ roles: ["admin"] });
    const response = await smtpHandler(smtpEvent(token, { method: "DELETE" }));
    assert.equal(response.statusCode, 405);
  });
});
