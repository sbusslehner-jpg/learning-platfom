-- ============================================================
-- 0015 – Sprachstamm verwaltbar machen (R-08)
--
-- Bisher konnten Märkte vorhandene Sprachen zugeordnet bekommen, den Stamm
-- selbst konnte niemand pflegen. Eine neue Sprache hieß: SQL-Konsole. Eine
-- nicht mehr gewünschte Sprache ließ sich gar nicht abschalten.
--
-- Löschen ist dabei die schlechtere Hälfte der Antwort: Sobald eine Sprache
-- einmal übersetzt wurde, hängen Übersetzungen, Marktzuordnungen,
-- Sprachvarianten von Dateien und die Oberflächensprache einzelner Personen
-- daran. `on delete restrict` verhindert das Löschen zu Recht – eine gelöschte
-- Sprache würde Übersetzungsarbeit vernichten.
--
-- Deshalb: deaktivieren statt löschen. Eine inaktive Sprache wird nicht mehr
-- angeboten und nicht mehr übersetzt, alle bereits vorhandenen Texte bleiben
-- erhalten und lesbar. Löschen bleibt möglich, solange eine Sprache nirgends
-- verwendet wird.
--
-- Gefahrlos wiederholbar.
-- ============================================================

alter table language add column if not exists active     boolean not null default true;
-- Reihenfolge in Auswahllisten. Ohne sie stünde Tschechisch vor Deutsch,
-- weil das Alphabet nichts über Wichtigkeit weiß.
alter table language add column if not exists sort       integer not null default 100;
alter table language add column if not exists created_at timestamptz not null default now();

comment on column language.active is
  'false = wird nicht mehr angeboten und nicht mehr uebersetzt. Vorhandene '
  'Uebersetzungen bleiben erhalten und lesbar.';

-- Deutsch ist die Mastersprache und steht deshalb vorn.
update language set sort = 0 where code = 'de' and sort = 100;

/**
 * Wo wird eine Sprache verwendet?
 *
 * Vor dem Deaktivieren oder Löschen muss die Verwaltung sehen, was daran
 * hängt. „Sprache löschen?" ohne Zahlen ist keine Frage, die man beantworten
 * kann.
 */
create or replace function language_usage(p_code text)
returns table (
  maerkte        integer,
  als_standard   integer,
  uebersetzungen integer,
  trainings      integer,
  dateien        integer,
  benutzer       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from market_language  where language_code = p_code),
    (select count(*)::integer from market_language  where language_code = p_code and is_default),
    (select count(*)::integer from translation      where language_code = p_code),
    (select count(*)::integer from training         where master_language = p_code),
    (select count(*)::integer from asset            where language_code = p_code),
    (select count(*)::integer from app_user         where ui_language = p_code);
$$;

revoke all on function language_usage(text) from public, anon;
grant execute on function language_usage(text) to authenticated, service_role;

/**
 * Deaktiviert eine Sprache.
 *
 * Zwei Fälle sind ausgeschlossen, weil sie etwas kaputtmachen würden, das
 * niemand sofort bemerkt:
 *
 *   Standardsprache eines Marktes – dieser Markt hätte danach keine
 *   Standardsprache mehr, und die Veröffentlichung liefe ins Leere.
 *
 *   Mastersprache eines Trainings – der Ausgangstext jeder Übersetzung wäre
 *   in einer Sprache, die es offiziell nicht mehr gibt.
 */
create or replace function set_language_active(p_code text, p_active boolean)
returns void
language plpgsql
as $$
declare
  v_default  integer;
  v_master   integer;
begin
  if not exists (select 1 from language where code = p_code) then
    raise exception 'Sprache % ist nicht bekannt', p_code using errcode = 'no_data_found';
  end if;

  if p_active then
    update language set active = true where code = p_code;
    return;
  end if;

  select count(*) into v_default from market_language where language_code = p_code and is_default;
  if v_default > 0 then
    raise exception
      'Sprache % ist Standardsprache von % Markt/Maerkten und kann nicht deaktiviert werden',
      p_code, v_default using errcode = 'restrict_violation';
  end if;

  select count(*) into v_master from training where master_language = p_code;
  if v_master > 0 then
    raise exception
      'Sprache % ist Mastersprache von % Training(s) und kann nicht deaktiviert werden',
      p_code, v_master using errcode = 'restrict_violation';
  end if;

  update language set active = false where code = p_code;
end;
$$;

revoke all on function set_language_active(text, boolean) from public, anon;
grant execute on function set_language_active(text, boolean) to authenticated, service_role;

-- Die Policies aus 0005 gelten weiter: lesen alle Angemeldeten, schreiben nur
-- die Verwaltung. `set_language_active` laeuft bewusst als `security invoker`,
-- damit genau diese Policy greift und die Pruefung nicht doppelt existiert.

-- ─── Kontrolle ───────────────────────────────────────────────────────────────
--
--   select * from language_usage('de');
--     → deutsch ist Mastersprache, also trainings > 0
--
--   select set_language_active('de', false);
--     → muss mit restrict_violation scheitern
