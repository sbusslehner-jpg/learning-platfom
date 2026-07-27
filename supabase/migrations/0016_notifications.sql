-- ============================================================
-- 0016 – Benachrichtigungen (R-09)
--
-- Bisher konnte die Plattform nur das versenden, was Keycloak von sich aus
-- verschickt: Einladungen und Passwort-Links. Für Ereignisse der Plattform
-- selbst – ein neues Training, ein gescheiterter Übersetzungslauf – gab es
-- keinen Weg.
--
-- Der Versand läuft über eine Ausgangsablage („Outbox") und nicht direkt aus
-- der auslösenden Stelle heraus. Drei Gründe:
--
--   Ein Veröffentlichungsvorgang darf nicht scheitern, weil ein Mailserver
--   gerade nicht antwortet. Das Ereignis ist geschehen; die Nachricht darüber
--   ist nachrangig.
--
--   Beim Veröffentlichen können hunderte Empfänger zusammenkommen. Sie
--   innerhalb der Transaktion zu bedienen hieße, die Datenbank für die Dauer
--   von hunderten SMTP-Verbindungen zu blockieren.
--
--   Ein Fehlschlag muss wiederholbar sein. Eine Nachricht, die im Nichts
--   verschwindet, fällt niemandem auf.
--
-- `dedupe_key` macht das Einstellen wiederholbar: Dieselbe Nachricht an
-- dieselbe Person zum selben Anlass entsteht nur einmal, egal wie oft der
-- Auslöser läuft. Ohne diesen Schlüssel bekäme jede erneute Veröffentlichung
-- desselben Trainings eine weitere Rundmail.
--
-- Gefahrlos wiederholbar.
-- ============================================================

-- ─── 1. Ausgangsablage ───────────────────────────────────────────────────────

create table if not exists notification (
  id           bigserial   primary key,
  created_at   timestamptz not null default now(),
  -- Art der Nachricht, bestimmt die Vorlage: 'training.published', …
  kind         text        not null,
  recipient    text        not null,
  -- Für die Anrede und die Abmeldung; bleibt beim Löschen des Kontos leer.
  user_id      uuid        references app_user(id) on delete set null,
  subject      text        not null,
  body         text        not null,
  -- Verhindert Doppelversand. NULL = Mehrfachversand ausdrücklich gewollt.
  dedupe_key   text,
  status       text        not null default 'pending',
  attempts     integer     not null default 0,
  last_error   text,
  -- Erlaubt späteren Versand (Zusammenfassungen, Ruhezeiten).
  send_after   timestamptz not null default now(),
  sent_at      timestamptz,
  constraint notification_status_check
    check (status in ('pending', 'sent', 'failed', 'dead'))
);

comment on table notification is
  'Ausgangsablage fuer Plattform-Benachrichtigungen. Der Worker unter '
  '/api/notify arbeitet sie ab. status=dead heisst: endgueltig aufgegeben, '
  'muss von Hand angesehen werden.';

-- Der eindeutige Index greift nur bei gesetztem Schlüssel: Nachrichten ohne
-- dedupe_key dürfen bewusst mehrfach entstehen.
create unique index if not exists notification_dedupe_idx
  on notification (dedupe_key) where dedupe_key is not null;

create index if not exists notification_queue_idx
  on notification (send_after) where status = 'pending';
create index if not exists notification_dead_idx
  on notification (created_at desc) where status = 'dead';

alter table notification enable row level security;

-- Lesen darf die Verwaltung – sie muss sehen, was hängt. Schreiben und
-- Versenden ausschliesslich der Dienstschluessel.
grant select on notification to authenticated;
revoke insert, update, delete on notification from authenticated;
revoke all on notification from anon;

drop policy if exists "notification_select" on notification;
create policy "notification_select" on notification for select to authenticated
  using (auth_is_admin());

-- ─── 2. Einstellen ───────────────────────────────────────────────────────────

/**
 * Stellt eine Nachricht ein.
 *
 * `on conflict do nothing` auf dem dedupe_key: Ein zweiter Aufruf für
 * dieselbe Sache tut nichts, statt zu scheitern. Der Auslöser soll sich nicht
 * merken müssen, ob er schon einmal gelaufen ist.
 */
create or replace function notify_enqueue(
  p_kind       text,
  p_recipient  text,
  p_subject    text,
  p_body       text,
  p_user_id    uuid    default null,
  p_dedupe_key text    default null,
  p_send_after timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_recipient is null or btrim(p_recipient) = '' then
    return null;                        -- ohne Adresse kein Versand
  end if;

  insert into notification (kind, recipient, user_id, subject, body, dedupe_key, send_after)
  values (p_kind, btrim(lower(p_recipient)), p_user_id, p_subject, p_body, p_dedupe_key, p_send_after)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function notify_enqueue(text, text, text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function notify_enqueue(text, text, text, text, uuid, text, timestamptz)
  to service_role;

/**
 * Benachrichtigt alle, die ein neu veröffentlichtes Training sehen dürfen.
 *
 * Die Empfängerermittlung folgt derselben Regel wie die Sichtbarkeit – Markt
 * ODER Gruppe ODER Person. Eine eigene Regel hier würde irgendwann von der
 * Sichtbarkeit abweichen, und dann bekämen Leute Post über Trainings, die sie
 * nicht öffnen können.
 *
 * Redaktion und Verwaltung bekommen bewusst KEINE Post: Sie sehen ohnehin
 * alles, und für sie wäre jede Veröffentlichung eine Mail über die eigene
 * Arbeit.
 */
create or replace function notify_training_published(p_training_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title   text;
  v_count   integer := 0;
  v_row     record;
begin
  select title into v_title from training where id = p_training_id and status = 'published';
  if v_title is null then
    return 0;
  end if;

  for v_row in
    select distinct u.id, u.email, u.name
      from app_user u
     where u.active
       and u.email is not null
       and not exists (
         select 1 from user_role_assignment r
          where r.user_id = u.id and r.role in ('editor', 'admin')
       )
       and (
         exists (
           select 1
             from user_market um
             join training_market tm on tm.market_id = um.market_id
            where um.user_id = u.id and tm.training_id = p_training_id
         )
         or exists (
           select 1
             from group_member gm
             join training_group tg on tg.group_id = gm.group_id
            where gm.user_id = u.id and tg.training_id = p_training_id
         )
         or exists (
           select 1 from training_user tu
            where tu.user_id = u.id and tu.training_id = p_training_id
         )
       )
  loop
    perform notify_enqueue(
      'training.published',
      v_row.email,
      'Neue Schulung verfügbar: ' || v_title,
      'Hallo ' || coalesce(v_row.name, '') || E',\n\n'
        || 'für Sie steht eine neue Schulung bereit:' || E'\n\n'
        || '    ' || v_title || E'\n\n'
        || 'Sie finden sie nach der Anmeldung in Ihrem Katalog.' || E'\n',
      v_row.id,
      -- Je Person und Training genau eine Nachricht, egal wie oft
      -- veröffentlicht wird.
      'training.published:' || p_training_id::text || ':' || v_row.id::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function notify_training_published(uuid) from public, anon;
grant execute on function notify_training_published(uuid) to authenticated, service_role;

-- ─── 3. An die Veröffentlichung hängen ───────────────────────────────────────
--
-- Der Aufruf steht am Ende von `publish_training`, nach allen Prüfungen.
-- Scheitert das Einstellen, scheitert die Veröffentlichung mit – deshalb ist
-- `notify_enqueue` so gebaut, dass es fast nicht scheitern kann: keine
-- Netzwerkzugriffe, kein Fremdsystem, nur ein INSERT.

create or replace function publish_training(p_training_id uuid, p_market_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not auth_is_editor() then
    raise exception 'editor role required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_market_ids), 0) = 0 then
    raise exception 'at least one market required' using errcode = '23514';
  end if;
  if not exists (
    select 1 from training t
    where t.id = p_training_id and btrim(t.title) <> ''
  ) then
    raise exception 'training missing or title empty' using errcode = '23514';
  end if;
  if not exists (select 1 from chapter c where c.training_id = p_training_id)
     or exists (
       select 1 from chapter c
       where c.training_id = p_training_id
         and not exists (select 1 from content_element e where e.chapter_id = c.id)
     ) then
    raise exception 'every training needs chapters with content' using errcode = '23514';
  end if;
  if (select count(*) from market m where m.id = any(p_market_ids))
       <> cardinality(p_market_ids) then
    raise exception 'unknown market' using errcode = '23503';
  end if;

  delete from training_market where training_id = p_training_id;
  insert into training_market (training_id, market_id)
    select p_training_id, market_id from unnest(p_market_ids) market_id;
  update training
     set status = 'published', published_at = now(), updated_at = now()
   where id = p_training_id;

  -- Neu (R-09): Empfänger einstellen. Der Versand geschieht später und
  -- anderswo; hier entsteht nur der Auftrag.
  perform notify_training_published(p_training_id);

  return true;
end;
$$;

-- ─── 4. Abarbeiten ───────────────────────────────────────────────────────────

/** Nimmt fällige Nachrichten und markiert sie als in Arbeit. */
create or replace function notify_claim(p_limit integer default 20)
returns setof notification
language sql
security definer
set search_path = public
as $$
  update notification
     set attempts = attempts + 1
   where id in (
     select id from notification
      where status = 'pending' and send_after <= now()
      order by send_after
      limit greatest(1, least(p_limit, 100))
      -- Zwei gleichzeitige Läufe duerfen sich nicht dieselbe Nachricht
      -- greifen; sonst geht sie doppelt raus.
      for update skip locked
   )
  returning *;
$$;

revoke all on function notify_claim(integer) from public, anon, authenticated;
grant execute on function notify_claim(integer) to service_role;

/**
 * Vermerkt das Ergebnis eines Versuchs.
 *
 * Nach `p_max_attempts` erfolglosen Versuchen gilt eine Nachricht als
 * endgültig gescheitert (`dead`). Endlos zu wiederholen hieße, einen
 * dauerhaften Fehler – falsche Adresse, gesperrtes Konto – für immer zu
 * verschleiern.
 */
create or replace function notify_settle(
  p_id bigint, p_ok boolean, p_error text default null, p_max_attempts integer default 5
)
returns void
language sql
security definer
set search_path = public
as $$
  update notification
     set status = case
                    when p_ok then 'sent'
                    when attempts >= p_max_attempts then 'dead'
                    else 'pending'
                  end,
         sent_at = case when p_ok then now() else sent_at end,
         last_error = case when p_ok then null else left(coalesce(p_error, ''), 300) end,
         -- Wachsender Abstand: 2, 8, 18, 32 Minuten. Ein Mailserver, der
         -- gerade nicht kann, wird von schnellem Nachfassen nicht schneller.
         send_after = case
                        when p_ok then send_after
                        else now() + (attempts * attempts * interval '2 minutes')
                      end
   where id = p_id;
$$;

revoke all on function notify_settle(bigint, boolean, text, integer) from public, anon, authenticated;
grant execute on function notify_settle(bigint, boolean, text, integer) to service_role;

/** Kennzahlen der Ausgangsablage – für die Anzeige in der Verwaltung. */
create or replace function notify_stats()
returns table (offen integer, versendet integer, gescheitert integer, aeltester timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from notification where status = 'pending'),
    (select count(*)::integer from notification where status = 'sent'),
    (select count(*)::integer from notification where status = 'dead'),
    (select min(created_at) from notification where status = 'pending');
$$;

revoke all on function notify_stats() from public, anon;
grant execute on function notify_stats() to authenticated, service_role;

-- ─── 5. Kontrolle ────────────────────────────────────────────────────────────
--
--   select * from notify_stats();
--   select kind, recipient, status, attempts, last_error
--     from notification order by created_at desc limit 20;
--
-- Doppelte Nachrichten darf es nicht geben:
--
--   select dedupe_key, count(*) from notification
--    where dedupe_key is not null group by 1 having count(*) > 1;
--     → muss leer sein
