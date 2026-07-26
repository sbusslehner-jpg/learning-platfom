// ============================================================
// Supabase-REST-Zugriff für die Netlify Functions.
//
// Verwendet den SERVICE-ROLE-Key. Der umgeht RLS vollständig – deshalb
// darf dieses Modul ausschließlich serverseitig laufen und niemals
// benutzergesteuerte Filter oder Spaltenlisten übernehmen. Alle Werte
// werden über die Query-API kodiert, es wird kein SQL zusammengesetzt.
//
// Alle Funktionen hier sind "best effort": Provisionierungsfehler dürfen
// eine Anmeldung oder Einladung nicht scheitern lassen (siehe auth/README.md).
// ============================================================

const OUTBOUND_TIMEOUT_MS = 10_000;

export function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return { url, key, configured: url !== "" && key !== "" };
}

/**
 * Ein einzelner PostgREST-Aufruf.
 * @param {string} path z. B. "/rest/v1/app_user"
 * @param {{method?: string, body?: unknown, prefer?: string, query?: Record<string,string>}} options
 */
async function restFetch(path, { method = "GET", body, prefer, query } = {}) {
  const cfg = supabaseConfig();
  if (!cfg.configured) {
    return { ok: false, status: 0, code: "CONFIG_ERROR", data: null };
  }

  const url = new URL(`${cfg.url}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[provisioning] Supabase nicht erreichbar:", error?.name ?? "unknown");
    return { ok: false, status: 0, code: "UNREACHABLE", data: null };
  }

  let data = null;
  const text = await response.text().catch(() => "");
  if (text !== "") {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    // Nur Status und PostgREST-Fehlercode loggen, keine Nutzdaten (PII).
    console.error(
      "[provisioning] Supabase-Fehler:",
      response.status,
      typeof data?.code === "string" ? data.code : "",
    );
    return { ok: false, status: response.status, code: "REST_ERROR", data };
  }

  return { ok: true, status: response.status, data };
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return null;
}

/**
 * Legt die `app_user`-Zeile zur externen Identität an oder aktualisiert sie.
 *
 * Schlüssel ist der Unique-Index `issuer, tenant, subject` (Migration 0003) –
 * NICHT die E-Mail. Damit bleibt die Identität stabil, wenn sich eine
 * Adresse ändert, und eine fremde E-Mail kann kein bestehendes Konto kapern.
 *
 * Bewusst NICHT geschrieben wird `active` (Migration 0004): ein von der
 * Verwaltung deaktivierter Benutzer darf sich nicht durch eine erneute
 * Anmeldung selbst reaktivieren. Nur die Einladung setzt `active` explizit.
 *
 * Der Fallback (SELECT → PATCH/POST) greift, wenn der Upsert scheitert,
 * z. B. weil der Unique-Index partiell ist (`where subject is not null`)
 * und Postgres ihn für ON CONFLICT nicht inferiert.
 *
 * @param {{issuer?: string, tenant: string, subject: string, name: string, email: string|null, active?: boolean}} row
 * @returns {Promise<{ok: true, id: string} | {ok: false, code: string}>}
 */
export async function upsertAppUser(row) {
  const record = {
    issuer: row.issuer ?? "keycloak",
    tenant: row.tenant,
    subject: row.subject,
    // `name` ist in app_user NOT NULL – deshalb immer ein Fallback setzen.
    name: row.name && row.name.trim() !== "" ? row.name.trim() : row.subject,
    email: row.email ?? null,
    ...(row.active === undefined ? {} : { active: row.active }),
  };

  const upsert = await restFetch("/rest/v1/app_user", {
    method: "POST",
    query: { on_conflict: "issuer,tenant,subject", select: "id" },
    prefer: "resolution=merge-duplicates,return=representation",
    body: [record],
  });

  const upserted = firstRow(upsert.data);
  if (upsert.ok && typeof upserted?.id === "string") {
    return { ok: true, id: upserted.id };
  }

  // ── Fallback ohne ON CONFLICT ──────────────────────────────────────────────
  const existing = await restFetch("/rest/v1/app_user", {
    query: {
      select: "id",
      issuer: `eq.${record.issuer}`,
      tenant: `eq.${record.tenant}`,
      subject: `eq.${record.subject}`,
      limit: "1",
    },
  });
  if (!existing.ok) return { ok: false, code: existing.code };

  const found = firstRow(existing.data);
  if (typeof found?.id === "string") {
    const patch = await restFetch("/rest/v1/app_user", {
      method: "PATCH",
      query: { id: `eq.${found.id}`, select: "id" },
      prefer: "return=representation",
      body: { name: record.name, email: record.email, ...(row.active === undefined ? {} : { active: row.active }) },
    });
    if (patch.ok) return { ok: true, id: found.id };
    return { ok: false, code: patch.code };
  }

  const inserted = await restFetch("/rest/v1/app_user", {
    method: "POST",
    query: { select: "id" },
    prefer: "return=representation",
    body: [record],
  });
  const newRow = firstRow(inserted.data);
  if (inserted.ok && typeof newRow?.id === "string") return { ok: true, id: newRow.id };
  return { ok: false, code: inserted.code ?? "REST_ERROR" };
}

/**
 * Schreibt die Rollenzuordnungen. Rollen müssen VOR dem Aufruf gegen die
 * Allowlist geprüft sein – `user_role_assignment.role` ist ein Enum, ein
 * unbekannter Wert würde die Anweisung scheitern lassen (kein Sicherheits-,
 * aber ein Konsistenzproblem).
 * @param {string} userId
 * @param {string[]} roles
 */
export async function assignUserRoles(userId, roles) {
  if (!Array.isArray(roles) || roles.length === 0) return { ok: true };
  const result = await restFetch("/rest/v1/user_role_assignment", {
    method: "POST",
    query: { on_conflict: "user_id,role" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: roles.map((role) => ({ user_id: userId, role })),
  });
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}

/**
 * Löst Marktcodes (`DE`, `AT`) zu `market.id` auf.
 * @param {string[]} codes
 * @returns {Promise<{ok: true, ids: string[], unknown: string[]} | {ok: false, code: string}>}
 */
export async function resolveMarketIds(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return { ok: true, ids: [], unknown: [] };
  const result = await restFetch("/rest/v1/market", {
    query: { select: "id,code", code: `in.(${codes.join(",")})` },
  });
  if (!result.ok) return { ok: false, code: result.code };
  const rows = Array.isArray(result.data) ? result.data : [];
  const ids = rows.map((r) => r?.id).filter((id) => typeof id === "string");
  const found = rows.map((r) => r?.code);
  return { ok: true, ids, unknown: codes.filter((c) => !found.includes(c)) };
}

/**
 * Schreibt die Marktzuordnungen.
 * @param {string} userId
 * @param {string[]} marketIds
 */
export async function assignUserMarkets(userId, marketIds) {
  if (!Array.isArray(marketIds) || marketIds.length === 0) return { ok: true };
  const result = await restFetch("/rest/v1/user_market", {
    method: "POST",
    query: { on_conflict: "user_id,market_id" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: marketIds.map((marketId) => ({ user_id: userId, market_id: marketId })),
  });
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}
