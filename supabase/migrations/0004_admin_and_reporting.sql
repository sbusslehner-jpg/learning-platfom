-- ============================================================
-- Verwaltung & Reporting: nicht-geheime App-Konfiguration,
-- Rollenpflege und Reporting-Aggregate.
--
-- Ergänzt 0001 (Datenmodell) und 0002 (Demo-Schreibzugriff).
-- ⚠️  In dieser Umgebung NICHT gegen Postgres ausgeführt.
-- ============================================================

-- ---------- Nicht-geheime Anwendungseinstellungen ----------
-- Bewusst getrennt von `setting` (0001), das ausschließlich verschlüsselte
-- Geheimnisse (z. B. Mistral-Key) enthält. Hier: Übersetzungs-, Benachrichtigungs-
-- und Plattformoptionen, die die Oberfläche lesen darf.
create table if not exists app_setting (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_user(id)
);

-- Startwerte (entsprechen den Defaults der Einstellungsseite)
insert into app_setting (key, value) values
  ('translation.auto_on_publish',   'true'::jsonb),
  ('translation.glossary_enabled',  'true'::jsonb),
  ('translation.model',             '"mistral-small-latest"'::jsonb),
  ('translation.master_language',   '"de"'::jsonb),
  ('platform.default_role',         '"user"'::jsonb),
  ('platform.ui_languages',         '["de","en","fr"]'::jsonb),
  ('notify.on_translation_error',   'true'::jsonb),
  ('notify.on_publish',             'false'::jsonb)
on conflict (key) do nothing;

-- ---------- Benutzerstatus (Deaktivierung, Konzept §6.5) ----------
alter table app_user add column if not exists active boolean not null default true;
alter table app_user add column if not exists last_active_at timestamptz;

-- ============================================================
-- Reporting-Views (aggregiert, datenschutzfreundlich)
--
-- Bewusst KEIN Reporting über einzelne Lernende (Konzept §6: kein
-- detailliertes Lern-Reporting für Vorgesetzte). Die Views liefern
-- ausschließlich Plattform- und Inhaltskennzahlen.
-- ============================================================

-- Inhaltsbestand je Modul
create or replace view report_content_health as
select
  p.title                                                as product,
  m.id                                                   as module_id,
  m.title                                                as module,
  count(t.id)                                            as trainings_total,
  count(t.id) filter (where t.status = 'published')       as trainings_published,
  count(t.id) filter (where t.status = 'draft')           as trainings_draft,
  coalesce(sum((select count(*) from chapter c where c.training_id = t.id)), 0) as chapters_total
from product p
join module m on m.product_id = p.id
left join training t on t.module_id = m.id
group by p.title, m.id, m.title, m.sort
order by m.sort;

-- Übersetzungsgesundheit je Sprache (über alle Trainings)
create or replace view report_translation_health as
select
  l.code                                                     as language_code,
  l.name                                                     as language_name,
  count(tr.id)                                               as fields_total,
  count(tr.id) filter (where tr.status in ('auto','edited'))  as fields_current,
  count(tr.id) filter (where tr.status = 'outdated')          as fields_outdated,
  count(tr.id) filter (where tr.status = 'error')             as fields_error,
  count(tr.id) filter (where tr.status = 'missing')           as fields_missing
from language l
left join translation tr on tr.language_code = l.code
group by l.code, l.name
having count(tr.id) > 0
order by l.name;

-- Marktabdeckung: wie viele veröffentlichte Trainings hat jeder Markt
create or replace view report_market_coverage as
select
  mk.id                                    as market_id,
  mk.code                                  as market_code,
  mk.name                                  as market_name,
  count(distinct tm.training_id)            as trainings_assigned,
  count(distinct ml.language_code)          as languages,
  count(distinct um.user_id)                as users
from market mk
left join training_market tm on tm.market_id = mk.id
left join market_language ml on ml.market_id = mk.id
left join user_market um on um.market_id = mk.id
group by mk.id, mk.code, mk.name
order by mk.code;

-- Aggregierter Lernfortschritt (nur Summen, keine Personenbezüge)
create or replace view report_learning_activity as
select
  count(distinct pr.user_id)                                    as active_learners,
  count(*)                                                      as chapters_completed,
  count(*) filter (where pr.viewed_at > now() - interval '7 days')  as completed_last_7d,
  count(*) filter (where pr.viewed_at > now() - interval '30 days') as completed_last_30d
from progress pr;

-- ---------- RLS ----------
alter table app_setting enable row level security;

-- Demo: Oberfläche darf Einstellungen lesen und schreiben.
-- ⚠️  Vor Go-Live durch auth-basierte Policy ersetzen (nur Admin-Rolle).
drop policy if exists "demo_all_app_setting" on app_setting;
create policy "demo_all_app_setting" on app_setting
  for all to anon, authenticated using (true) with check (true);

-- app_user für die Benutzerverwaltung im Demo-Modus zugänglich machen.
-- ⚠️  Enthält personenbezogene Daten – vor Go-Live zwingend auf Admin-Rolle
--     einschränken (siehe docs/redaktion.md, Absicherung vor Go-Live).
drop policy if exists "demo_all_app_user" on app_user;
create policy "demo_all_app_user" on app_user
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "demo_all_user_role" on user_role_assignment;
create policy "demo_all_user_role" on user_role_assignment
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "demo_all_user_market" on user_market;
create policy "demo_all_user_market" on user_market
  for all to anon, authenticated using (true) with check (true);

-- Märkte/Sprachen im Demo-Modus verwaltbar
drop policy if exists "demo_write_market" on market;
create policy "demo_write_market" on market
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "demo_write_market_language" on market_language;
create policy "demo_write_market_language" on market_language
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "demo_write_language" on language;
create policy "demo_write_language" on language
  for all to anon, authenticated using (true) with check (true);
