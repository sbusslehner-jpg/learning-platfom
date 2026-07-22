-- ============================================================
-- ServiceQ → GITacademy SSO: Ticket-, Session- und Audit-Store
-- Referenzimplementierung zur Architektur-Challenge
-- (docs/serviceq-academy/). Alle Tabellen sind service-role-only:
-- ausschließlich die Edge Functions greifen darauf zu, niemals der
-- anonyme Browser-Client.
--
-- ⚠️  HINWEIS: In dieser Entwicklungsumgebung wurde diese Migration
--     NICHT gegen eine echte Postgres-Instanz ausgeführt. Vor Nutzung
--     in einer Supabase-Umgebung testen (siehe docs/serviceq-academy).
-- ============================================================

-- ---------- Enums ----------
do $$ begin
  create type sso_auth_method as enum ('private_key_jwt', 'mtls', 'client_secret', 'api_key');
exception when duplicate_object then null; end $$;

do $$ begin
  create type launch_ticket_status as enum ('unused', 'used', 'expired');
exception when duplicate_object then null; end $$;

-- ---------- Systemclients (ServiceQ) ----------
create table if not exists sso_client (
  client_id             text primary key,              -- z. B. 'serviceq-prod'
  display_name          text not null,
  auth_method           sso_auth_method not null default 'private_key_jwt',
  public_key_pem        text,                            -- für private_key_jwt / mTLS
  client_secret_hash    text,                            -- nur Hash, falls client_secret
  allowed_tenants       text[] not null default '{}',
  allowed_roles         text[] not null default '{}',    -- erlaubte Academy-Rollen (Zielmenge)
  allowed_target_types  text[] not null default array['home','training','learning_path'],
  default_role          text not null default 'learner',
  return_url            text not null,                   -- Rückleitung zu ServiceQ (nur aus Config, B7)
  enabled               boolean not null default true,
  created_at            timestamptz not null default now()
);

-- ServiceQ-Rolle → Academy-Rolle (Allowlist, B12)
create table if not exists sso_role_map (
  client_id     text not null references sso_client(client_id) on delete cascade,
  serviceq_role text not null,
  academy_role  text not null,
  primary key (client_id, serviceq_role)
);

-- ---------- Benutzer: externe Identität (B3) ----------
-- app_user (0001) wird um die stabile externe Identität erweitert und die
-- E-Mail als alleiniger Schlüssel entschärft.
alter table app_user add column if not exists issuer  text;
alter table app_user add column if not exists tenant  text;
alter table app_user add column if not exists subject text;

do $$ begin
  alter table app_user drop constraint if exists app_user_email_key;
exception when undefined_object then null; end $$;
alter table app_user alter column email drop not null;

create unique index if not exists app_user_external_identity
  on app_user (issuer, tenant, subject)
  where subject is not null;

-- ---------- Launch-Ticket (opaque, nur Hash gespeichert) ----------
create table if not exists launch_ticket (
  id                uuid primary key default gen_random_uuid(),
  code_hash         text not null unique,               -- SHA-256 des Codes (nie Klartext, B/§10.3)
  client_id         text not null references sso_client(client_id),
  app_user_id       uuid references app_user(id) on delete cascade,
  issuer            text not null,
  tenant            text not null,
  subject           text not null,
  external_user_key text not null,                       -- issuer:tenant:subject
  market            text,
  locale            text,
  roles             jsonb not null default '[]'::jsonb,  -- gemappte Academy-Rollen
  target_type       text not null,
  target_id         text not null,
  status            launch_ticket_status not null default 'unused',
  idempotency_key   text,
  correlation_id    text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,                -- created_at + ttl (120 s)
  used_at           timestamptz
);

-- Idempotenz: gleicher (client, key) liefert dasselbe Ticket (B5)
create unique index if not exists launch_ticket_idempotency
  on launch_ticket (client_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists launch_ticket_lookup on launch_ticket (code_hash);

-- ---------- Academy-Session (opaques Handle, nur Hash gespeichert) ----------
create table if not exists academy_session (
  id                  uuid primary key default gen_random_uuid(),
  session_hash        text not null unique,              -- SHA-256 des Session-Handles
  csrf_hash           text not null,                     -- SHA-256 des CSRF-Tokens (Double-Submit)
  app_user_id         uuid not null references app_user(id) on delete cascade,
  client_id           text not null references sso_client(client_id),
  tenant              text not null,
  market              text,
  locale              text,
  academy_role        text not null,
  created_at          timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),
  idle_expires_at     timestamptz not null,              -- last_activity + idle_ttl
  absolute_expires_at timestamptz not null,              -- created_at + absolute_ttl (unveränderlich)
  revoked_at          timestamptz,
  revoke_reason       text
);

create index if not exists academy_session_user on academy_session (app_user_id);

-- ---------- Replay-Sperre für Client-Assertion-JWTs (private_key_jwt, B4) ----------
-- Jedes verbrauchte jti wird gespeichert; ein zweiter Aufruf mit demselben jti
-- verletzt den Primary Key → Replay abgewiesen.
create table if not exists sso_used_assertion (
  jti         text primary key,
  client_id   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz not null default now()
);
create index if not exists sso_used_assertion_exp on sso_used_assertion (expires_at);

-- ---------- Audit (pseudonymisiert, ohne Tokens/PII, §12) ----------
create table if not exists sso_audit (
  id                uuid primary key default gen_random_uuid(),
  ts                timestamptz not null default now(),
  event_type        text not null,                       -- z. B. SSO_TICKET_CONSUMED
  result            text not null,                       -- SUCCESS | DENIED | ERROR
  client_id         text,
  tenant            text,
  subject_reference text,                                -- pseudonymisiert (Hash), nie Klartext
  target_type       text,
  target_id         text,
  correlation_id    text,
  meta              jsonb not null default '{}'::jsonb
);

create index if not exists sso_audit_ts on sso_audit (ts);
create index if not exists sso_audit_client on sso_audit (client_id, ts);

-- ============================================================
-- Atomare Ticket-Einlösung (B/§5.2) — Kern gegen Replay & Parallel-Consume
-- Genau EIN UPDATE dreht 'unused'→'used'. Zwei parallele Aufrufe:
-- nur einer erhält die Zeile zurück, der andere null → Ablehnung.
-- Ablauf wird gegen die DB-Zeit now() bewertet (Clock-Skew-Schutz, B11).
-- ============================================================
create or replace function consume_launch_ticket(p_code_hash text)
returns setof launch_ticket
language sql
as $$
  update launch_ticket
     set status = 'used', used_at = now()
   where code_hash = p_code_hash
     and status = 'unused'
     and expires_at > now()
  returning *;
$$;

-- Klassifizierung fehlgeschlagener Einlösungen (read-only, nicht sicherheitskritisch):
-- liefert 'already_used' | 'expired' | 'not_found', damit die Edge Function den
-- korrekten Fehlercode (409/410/404) setzen kann.
create or replace function classify_launch_ticket(p_code_hash text)
returns text
language sql
stable
as $$
  select case
    when t.id is null then 'not_found'
    when t.status = 'used' then 'already_used'
    when t.expires_at <= now() then 'expired'
    else 'unexpected'
  end
  from (select * from launch_ticket where code_hash = p_code_hash) t
  right join (select 1) _ on true
  limit 1;
$$;

-- Session-Validierung (Idle + Absolut, gegen DB-Zeit) — read-only.
create or replace function is_session_valid(p_session_hash text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from academy_session s
     where s.session_hash = p_session_hash
       and s.revoked_at is null
       and s.idle_expires_at > now()
       and s.absolute_expires_at > now()
  );
$$;

-- ============================================================
-- Row Level Security: alle SSO-Tabellen sind service-role-only.
-- RLS aktiv + KEINE Policy für anon/authenticated = vollständige Sperre.
-- (service_role umgeht RLS und wird ausschließlich in Edge Functions genutzt.)
-- ============================================================
alter table sso_client         enable row level security;
alter table sso_role_map       enable row level security;
alter table launch_ticket      enable row level security;
alter table academy_session    enable row level security;
alter table sso_audit          enable row level security;
alter table sso_used_assertion enable row level security;

-- Bewusst keine anon/authenticated-Policies: der Browser darf diese
-- Tabellen niemals sehen oder schreiben.
