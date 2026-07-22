-- ============================================================
-- DEMO-MODUS: Schreibzugriff für die Redaktion ohne Login
-- ============================================================
-- Solange es keine echte Anmeldung (Supabase Auth) gibt, kann die
-- Redaktionsoberfläche nur arbeiten, wenn der anonyme Client lesen
-- UND schreiben darf. Diese Migration öffnet die redaktionellen
-- Tabellen bewusst für den anon-Zugriff.
--
-- ⚠️  NUR FÜR DIE DEMO. Vor dem Go-Live rückgängig machen und durch
--     auth-basierte Policies ersetzen (nur Editor-Rolle schreibt,
--     User sehen nur veröffentlichte Inhalte ihrer Märkte).
--     Siehe docs/redaktion.md, Abschnitt „Absicherung vor Go-Live".
-- ============================================================

-- Erst die published-only-Lesepolicies ersetzen: die Redaktion muss
-- auch Entwürfe sehen. (Die Lernansicht filtert Entwürfe künftig über
-- die Auth-Schicht; für die Demo ist voller Lesezugriff akzeptabel.)
drop policy if exists "training_read_published"    on training;
drop policy if exists "training_market_read"       on training_market;
drop policy if exists "chapter_read_published"     on chapter;
drop policy if exists "element_read_published"     on content_element;
drop policy if exists "asset_read_published"       on asset;
drop policy if exists "translation_read_published" on translation;

-- Volle Lese- und Schreibrechte für den anon-Client auf allen
-- redaktionellen Tabellen (Demo).
do $$
declare t text;
begin
  foreach t in array array[
    'product', 'module', 'training', 'training_market',
    'chapter', 'content_element', 'asset',
    'translation', 'translation_job'
  ] loop
    execute format('drop policy if exists "demo_all_%1$s" on %1$I;', t);
    execute format(
      'create policy "demo_all_%1$s" on %1$I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- Stammdaten bleiben wie gehabt öffentlich lesbar (market/language/
-- market_language haben bereits *_read-Policies aus 0001).
