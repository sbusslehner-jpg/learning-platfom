-- ============================================================
-- 0010 – Missbrauchsschutz (R-13) und Audit-Trail (R-10)
--
-- Beides braucht einen Speicher, der über einzelne Function-Aufrufe hinaus
-- lebt. Netlify Functions sind zustandslos: Ein Zähler im Modulspeicher hält
-- nur, solange dieselbe warme Instanz antwortet – bei Missbrauch also gerade
-- dann nicht, wenn er gebraucht wird. Deshalb liegt beides in der Datenbank.
--
-- Gefahrlos wiederholbar.
-- ============================================================

-- ─── 1. Rate-Limit (R-13) ────────────────────────────────────────────────────

create table if not exists rate_limit (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

comment on table rate_limit is
  'Zähler je Schlüssel und Zeitfenster. Wird ausschließlich von den '
  'Serverfunktionen über rate_limit_hit() beschrieben.';

/**
 * Zählt einen Zugriff und meldet, ob er noch innerhalb des Limits liegt.
 *
 * Atomar über `insert ... on conflict do update`: Zwei gleichzeitige Aufrufe
 * können sich nicht gegenseitig überschreiben. Ein Lese-dann-Schreib-Muster
 * hätte genau unter Last versagt – also dann, wenn es zählt.
 *
 * @returns true = erlaubt, false = Limit erreicht
 */
create or replace function rate_limit_hit(
  p_bucket  text,
  p_limit   integer,
  p_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_limit <= 0 or p_seconds <= 0 then
    return true;
  end if;

  -- Feste Fenster statt gleitender: deutlich billiger und für den Zweck
  -- ausreichend. Im ungünstigsten Fall sind kurzzeitig bis zu 2x limit
  -- Zugriffe möglich (Fensterwechsel) – gegenüber dem Aufwand eines
  -- gleitenden Fensters ist das ein guter Tausch.
  v_window := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);

  insert into rate_limit (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set hits = rate_limit.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

/** Räumt abgelaufene Zähler ab. Von einer geplanten Aufgabe aufrufbar. */
create or replace function rate_limit_cleanup()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from rate_limit where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from gone;
$$;

-- Nur die Serverfunktionen (service_role) fassen die Tabelle an. Für
-- `authenticated` gibt es keinen Grund, Zähler zu lesen oder zu schreiben –
-- und ein manipulierbarer Zähler wäre kein Schutz.
alter table rate_limit enable row level security;
revoke all on rate_limit from anon, authenticated;

-- ─── 2. Audit-Trail (R-10) ───────────────────────────────────────────────────

create table if not exists audit_event (
  id           bigserial   primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid        references app_user(id) on delete set null,
  actor_label  text        not null,
  action       text        not null,
  target_type  text,
  target_id    text,
  outcome      text        not null default 'ok',
  detail       jsonb       not null default '{}'::jsonb
);

comment on table audit_event is
  'Nachvollziehbarkeit administrativer und redaktioneller Aenderungen. '
  'Nur anfuegen - kein Update, kein Delete. Enthaelt bewusst keine '
  'Inhaltsdaten und keine Geheimnisse.';

create index if not exists audit_event_time_idx   on audit_event (occurred_at desc);
create index if not exists audit_event_actor_idx  on audit_event (actor_id, occurred_at desc);
create index if not exists audit_event_action_idx on audit_event (action, occurred_at desc);

alter table audit_event enable row level security;

-- Lesen dürfen Administratoren. Schreiben tut ausschließlich der
-- Service-Account der Serverfunktionen: Ein Protokoll, das der Protokollierte
-- selbst ändern kann, ist kein Protokoll.
grant select on audit_event to authenticated;
revoke insert, update, delete on audit_event from authenticated;
revoke all on audit_event from anon;

drop policy if exists "audit_event_select" on audit_event;
create policy "audit_event_select" on audit_event for select to authenticated
  using (auth_is_admin());

-- `actor_label` bleibt erhalten, auch wenn das Konto später gelöscht wird
-- (actor_id wird dann NULL). Sonst verlöre das Protokoll rückwirkend seine
-- Aussagekraft – ausgerechnet bei gelöschten Konten.

-- ─── 3. Kontrolle ────────────────────────────────────────────────────────────
--
--   select rate_limit_hit('probe', 2, 60);   -- true
--   select rate_limit_hit('probe', 2, 60);   -- true
--   select rate_limit_hit('probe', 2, 60);   -- false
--   delete from rate_limit where bucket = 'probe';
--
--   select count(*) from audit_event;        -- als Admin lesbar
