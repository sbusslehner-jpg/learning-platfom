-- ============================================================
-- PRODUKTIONS-BERECHTIGUNGEN: Demo-Schreibrechte zurücknehmen
--
-- Beseitigt den P0-Blocker aus docs/produktstatus.md: bisher durfte der
-- anonyme Browser-Client (anon-Key) lesen UND schreiben – an jeder
-- Rollenprüfung vorbei. Ab hier gilt:
--
--   • `anon` hat KEINEN Zugriff auf Fachdaten.
--   • Zugriff nur mit gültigem Token aus dem Keycloak-Austausch
--     (siehe netlify/functions/auth-exchange.mjs). Dieses Token trägt:
--       sub            = app_user.id          → auth.uid()
--       academy_roles  = ["admin"|"editor"|"user", …]
--       markets        = ["DE","AT", …]
--       tenant         = "PHS_AT"
--   • Rechte werden aus diesen Claims abgeleitet – die Prüfung in der
--     Oberfläche ist nur Ergonomie, verbindlich ist diese Schicht.
--
-- Reihenfolge: nach 0001–0004 ausführen.
-- ⚠️  In dieser Umgebung NICHT gegen Postgres ausgeführt (kein Docker/Postgres,
--     Registry-Zugriff durch die Netzwerkrichtlinie blockiert).
-- ============================================================

-- ─── 1. Hilfsfunktionen für Ansprüche aus dem Token ──────────────────────────

-- Rolle im Token vorhanden? (jsonb ? text prüft Array-Elemente)
create or replace function auth_has_role(target text)
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'academy_roles') ? target, false);
$$;

create or replace function auth_is_admin()  returns boolean language sql stable as $$ select auth_has_role('admin')  $$;
create or replace function auth_is_editor() returns boolean language sql stable as $$ select auth_has_role('editor') $$;

/** Marktcodes des angemeldeten Benutzers aus dem Token. */
create or replace function auth_markets()
returns text[]
language sql
stable
as $$
  select coalesce(
    array(select jsonb_array_elements_text(auth.jwt() -> 'markets')),
    '{}'::text[]
  );
$$;

/**
 * Darf der angemeldete Benutzer dieses Training sehen?
 * Redaktion und Verwaltung sehen alles (auch Entwürfe, für Reporting und Pflege).
 * Lernende sehen nur veröffentlichte Trainings, die einem ihrer Märkte
 * zugeordnet sind (Sichtbarkeitsregel Konzept §2).
 */
create or replace function auth_can_see_training(p_training_id uuid)
returns boolean
language sql
stable
as $$
  select case
    when auth_is_editor() or auth_is_admin() then true
    else exists (
      select 1
      from training t
      join training_market tm on tm.training_id = t.id
      join market m           on m.id = tm.market_id
      where t.id = p_training_id
        and t.status = 'published'
        and m.code = any (auth_markets())
    )
  end;
$$;

-- ─── 2. Alle Demo-Policies entfernen (0002 und 0004) ─────────────────────────

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and (policyname like 'demo_%' or policyname like '%_read')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Sicherheitsnetz: dem anonymen Rollennamen jede Tabellenrechte entziehen.
-- (RLS ohne Policy sperrt bereits; das hier verhindert zusätzlich, dass eine
--  künftige Policy versehentlich für `anon` greift.)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Angemeldete Identitäten brauchen die Basisrechte; die Feinsteuerung
-- übernehmen ausschließlich die Policies darunter.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ─── 3. Inhaltsstruktur ──────────────────────────────────────────────────────

-- Produkte und Module: alle Angemeldeten lesen, Redaktion schreibt.
create policy "product_select" on product for select to authenticated using (true);
create policy "product_write"  on product for all    to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

create policy "module_select" on module for select to authenticated using (true);
create policy "module_write"  on module for all    to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

-- Trainings: Sichtbarkeit über auth_can_see_training(), Schreiben nur Redaktion.
create policy "training_select" on training for select to authenticated
  using (auth_can_see_training(id));
create policy "training_write" on training for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

create policy "training_market_select" on training_market for select to authenticated
  using (auth_can_see_training(training_id));
create policy "training_market_write" on training_market for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

create policy "chapter_select" on chapter for select to authenticated
  using (auth_can_see_training(training_id));
create policy "chapter_write" on chapter for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

create policy "element_select" on content_element for select to authenticated
  using (exists (select 1 from chapter c where c.id = chapter_id and auth_can_see_training(c.training_id)));
create policy "element_write" on content_element for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

create policy "asset_select" on asset for select to authenticated
  using (exists (
    select 1 from content_element e join chapter c on c.id = e.chapter_id
    where e.id = element_id and auth_can_see_training(c.training_id)));
create policy "asset_write" on asset for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

-- ─── 4. Übersetzungen ────────────────────────────────────────────────────────

create policy "translation_select" on translation for select to authenticated
  using (
    ref_type in ('product', 'module')
    or (ref_type = 'training'  and auth_can_see_training(ref_id))
    or (ref_type = 'chapter'   and exists (
          select 1 from chapter c where c.id = ref_id and auth_can_see_training(c.training_id)))
    or (ref_type = 'content_element' and exists (
          select 1 from content_element e join chapter c on c.id = e.chapter_id
          where e.id = ref_id and auth_can_see_training(c.training_id)))
  );

-- Korrekturen und Übersetzungsläufe: nur Redaktion.
create policy "translation_write" on translation for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

create policy "translation_job_read"  on translation_job for select to authenticated
  using (auth_is_editor() or auth_is_admin());
create policy "translation_job_write" on translation_job for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

-- ─── 5. Stammdaten: Märkte und Sprachen ──────────────────────────────────────

create policy "language_select" on language for select to authenticated using (true);
create policy "language_write"  on language for all    to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy "market_select" on market for select to authenticated using (true);
create policy "market_write"  on market for all    to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy "market_language_select" on market_language for select to authenticated using (true);
create policy "market_language_write"  on market_language for all    to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- ─── 6. Benutzer und Zuordnungen ─────────────────────────────────────────────
-- Jeder sieht sich selbst; die vollständige Liste nur die Verwaltung.

create policy "app_user_select_self_or_admin" on app_user for select to authenticated
  using (id = auth.uid() or auth_is_admin());
create policy "app_user_write_admin" on app_user for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy "user_role_select" on user_role_assignment for select to authenticated
  using (user_id = auth.uid() or auth_is_admin());
create policy "user_role_write" on user_role_assignment for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy "user_market_select" on user_market for select to authenticated
  using (user_id = auth.uid() or auth_is_admin());
create policy "user_market_write" on user_market for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

alter table user_product enable row level security;
create policy "user_product_select" on user_product for select to authenticated
  using (user_id = auth.uid() or auth_is_admin());
create policy "user_product_write" on user_product for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- ─── 7. Lernfortschritt: strikt personenbezogen ──────────────────────────────
-- Niemand – auch kein Administrator – liest den Fortschritt anderer Personen.
-- Auswertungen erfolgen ausschließlich über die aggregierten Views (Abschnitt 9).

create policy "progress_own" on progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── 8. Einstellungen ────────────────────────────────────────────────────────

create policy "app_setting_select" on app_setting for select to authenticated using (true);
create policy "app_setting_write"  on app_setting for all    to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- `setting` enthält verschlüsselte Geheimnisse (u. a. Mistral-Key):
-- bewusst KEINE Policy → ausschließlich über service_role erreichbar.

-- ─── 9. Reporting-Views ──────────────────────────────────────────────────────
-- Views laufen standardmäßig mit den Rechten des Eigentümers und würden RLS
-- damit umgehen. `security_invoker` erzwingt die Rechte des Aufrufers.
-- Der aggregierte Lernbericht bleibt bewusst rein summarisch.

alter view report_content_health     set (security_invoker = on);
alter view report_translation_health set (security_invoker = on);
alter view report_market_coverage    set (security_invoker = on);
alter view report_learning_activity  set (security_invoker = on);

revoke all on report_content_health, report_translation_health,
              report_market_coverage, report_learning_activity from anon;
grant select on report_content_health, report_translation_health,
                report_market_coverage, report_learning_activity to authenticated;

-- ─── 10. SSO-Tabellen bleiben service-role-only ──────────────────────────────
-- sso_client, sso_role_map, launch_ticket, academy_session, sso_audit,
-- sso_used_assertion haben RLS aktiv und bewusst keine Policy (siehe 0003).

-- ─── 11. Kontrolle ───────────────────────────────────────────────────────────
-- Nach dem Einspielen prüfen: es darf keine Policy mehr für `anon` geben.
--
--   select tablename, policyname, roles
--     from pg_policies
--    where schemaname = 'public' and 'anon' = any (roles);
--   -- erwartete Ausgabe: 0 Zeilen
