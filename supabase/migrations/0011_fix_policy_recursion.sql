-- ============================================================
-- 0011 – Endlosrekursion in den Sichtbarkeits-Policies beheben
--
-- BEFUND (bei der Live-Abnahme gegen die echte Datenbank gefunden):
-- Jede Abfrage auf `training`, `training_market`, `chapter`, `content_element`,
-- `asset` oder `translation` scheiterte für die Rolle `user` mit
--
--     SQLSTATE 54001 – stack depth limit exceeded
--
-- Ursache ist ein Zirkelschluss zwischen Policy und Hilfsfunktion:
--
--     training_select  →  auth_can_see_training(id)
--                      →  select … from training …      (0005)
--                      →  training_select                (RLS greift erneut)
--                      →  auth_can_see_training(id)  …   ad infinitum
--
-- Dasselbe über `training_market` (0005) sowie seit 0009 über `training_group`
-- und `training_user`. Betroffen war ausschließlich die Rolle `user`: Für
-- Redaktion und Verwaltung kürzt die Funktion in der ersten Zeile ab und liest
-- gar keine Tabelle.
--
-- Warum das bis hierher niemandem auffiel: Eine Policy wird nur ausgewertet,
-- wenn es Zeilen auszuwerten gibt. Solange die Datenbank leer war, lief jeder
-- Test grün – der Fehler wäre erst mit dem ersten veröffentlichten Training
-- sichtbar geworden, und dann sofort für alle Lernenden gleichzeitig.
--
-- BEHEBUNG
-- Die Hilfsfunktionen werden `security definer`. Sie laufen damit als Eigentümer
-- und lesen an RLS vorbei. Das ist hier nicht nur zulässig, sondern die
-- vorgesehene Bauform: Die Funktion IST die Rechteprüfung. Sie nimmt eine
-- Trainings-Kennung entgegen und gibt ausschließlich `true`/`false` zurück –
-- niemals Daten. Wer sie fragt, erfährt nur etwas über die eigenen Rechte.
--
-- `auth.uid()` und `auth.jwt()` lesen Sitzungsparameter, keine Rollenrechte;
-- sie liefern unter `security definer` unverändert die Ansprüche des Aufrufers.
--
-- `set search_path = public` ist Pflicht: Ohne feste Suchreihenfolge könnte eine
-- untergeschobene gleichnamige Funktion in einem anderen Schema mit den Rechten
-- des Eigentümers ausgeführt werden. Alle Aufrufe nach `auth.*` sind zusätzlich
-- schemaqualifiziert.
--
-- Gefahrlos wiederholbar.
-- ============================================================

-- ─── 1. Gruppenmitgliedschaft ────────────────────────────────────────────────

create or replace function auth_in_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_member gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  );
$$;

-- ─── 2. Sichtbarkeit eines Trainings ─────────────────────────────────────────
--
-- Fachlich unverändert gegenüber 0009: Markt ODER Gruppe ODER Person, additiv.
-- Geändert ist ausschließlich die Ausführungsart.

create or replace function auth_can_see_training(p_training_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_is_editor() or auth_is_admin() then true
    else exists (
      select 1
      from training t
      where t.id = p_training_id
        and t.status = 'published'
        and (
          -- Markt
          exists (
            select 1
            from training_market tm
            join market m on m.id = tm.market_id
            where tm.training_id = t.id
              and m.code = any (auth_markets())
          )
          -- Gruppe
          or exists (
            select 1
            from training_group tg
            join group_member gm on gm.group_id = tg.group_id
            where tg.training_id = t.id
              and gm.user_id = auth.uid()
          )
          -- Person
          or exists (
            select 1
            from training_user tu
            where tu.training_id = t.id
              and tu.user_id = auth.uid()
          )
        )
    )
  end;
$$;

-- ─── 3. Ausführungsrecht ─────────────────────────────────────────────────────
--
-- Angemeldete dürfen fragen; nicht angemeldete nicht. Ohne gültige Ansprüche
-- liefert die Funktion ohnehin `false`, aber `anon` soll sie gar nicht erst
-- aufrufen können.

revoke all on function auth_in_group(uuid)         from public, anon;
revoke all on function auth_can_see_training(uuid) from public, anon;
grant execute on function auth_in_group(uuid)         to authenticated, service_role;
grant execute on function auth_can_see_training(uuid) to authenticated, service_role;

-- ─── 4. Kontrolle ────────────────────────────────────────────────────────────
--
-- Beide Funktionen müssen `prosecdef = true` melden:
--
--   select proname, prosecdef, proconfig
--     from pg_proc
--    where proname in ('auth_can_see_training','auth_in_group')
--      and pronamespace = 'public'::regnamespace;
--
-- Und als Lernender darf das hier nicht mehr mit 54001 abbrechen:
--
--   set role authenticated;
--   select set_config('request.jwt.claims',
--     '{"sub":"…","academy_roles":["user"],"markets":["AT"]}', true);
--   select count(*) from training;
