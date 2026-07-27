-- ============================================================
-- 0017 – Kein stiller Leerlauf bei abgewiesenen Änderungen
--
-- BEFUND (bei der Abnahme gefunden): Ein Lernender konnte
-- `set_language_active('xx', true)` aufrufen und bekam KEINEN Fehler zurück.
--
-- Sicherheitstechnisch war nichts offen: Die Policy `language_write` verlangt
-- die Verwaltungsrolle, und die Zeile wurde nicht verändert. Row-Level-Security
-- filtert aber, sie wirft nicht. Ein UPDATE, das keine sichtbare Zeile trifft,
-- ändert null Zeilen und gilt als erfolgreich.
--
-- Für die aufrufende Seite ist das die schlechteste aller Antworten: Sie hört
-- „hat geklappt" und zeigt einen Erfolg an, während nichts geschehen ist. Der
-- Fehler fällt erst auf, wenn jemand später bemerkt, dass die Einstellung nie
-- übernommen wurde – und dann sucht man an der falschen Stelle.
--
-- Die Behebung dupliziert die Rechteprüfung NICHT. Sie prüft, ob die Anweisung
-- eine Zeile erreicht hat, und meldet andernfalls fehlende Berechtigung. Die
-- Entscheidung bleibt bei der Policy; hier wird nur ausgesprochen, was sie
-- entschieden hat.
--
-- Gefahrlos wiederholbar.
-- ============================================================

create or replace function set_language_active(p_code text, p_active boolean)
returns void
language plpgsql
as $$
declare
  v_default integer;
  v_master  integer;
  v_rows    integer;
begin
  if not exists (select 1 from language where code = p_code) then
    raise exception 'Sprache % ist nicht bekannt', p_code using errcode = 'no_data_found';
  end if;

  if p_active then
    update language set active = true where code = p_code;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Keine Berechtigung, Sprachen zu aendern'
        using errcode = 'insufficient_privilege';
    end if;
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
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Keine Berechtigung, Sprachen zu aendern'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

/**
 * Dasselbe Muster bei den Zuweisungen.
 *
 * Ein Aufruf mit leeren Listen bestand bisher aus zwei DELETEs, die für einen
 * Unberechtigten null Zeilen treffen – und meldete Erfolg. Nur mit gefüllten
 * Listen scheiterte er am WITH CHECK des INSERT. Dass die Rückmeldung davon
 * abhing, WAS man zuweisen wollte, war der eigentliche Fehler.
 */
create or replace function set_training_assignment(
  p_training_id uuid,
  p_group_ids   uuid[],
  p_user_ids    uuid[]
)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from training where id = p_training_id) then
    raise exception 'Training % existiert nicht', p_training_id
      using errcode = 'no_data_found';
  end if;

  -- Vorab und ausdrücklich, weil ein leerer Auftrag sonst nichts hätte, woran
  -- er scheitern könnte.
  if not auth_is_editor() then
    raise exception 'Keine Berechtigung, Zuweisungen zu aendern'
      using errcode = 'insufficient_privilege';
  end if;

  delete from training_group where training_id = p_training_id;
  delete from training_user  where training_id = p_training_id;

  if p_group_ids is not null and array_length(p_group_ids, 1) > 0 then
    insert into training_group (training_id, group_id)
    select p_training_id, unnest(p_group_ids)
    on conflict do nothing;
  end if;

  if p_user_ids is not null and array_length(p_user_ids, 1) > 0 then
    insert into training_user (training_id, user_id)
    select p_training_id, unnest(p_user_ids)
    on conflict do nothing;
  end if;
end;
$$;

-- ─── Kontrolle ───────────────────────────────────────────────────────────────
--
-- Als Lernender müssen beide Aufrufe mit 42501 scheitern – nicht still nichts tun:
--
--   select set_language_active('en', true);
--   select set_training_assignment('<training>', '{}', '{}');
