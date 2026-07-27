-- ============================================================
-- 0006 – Upsert der externen Identität reparieren
--
-- Symptom: Nach erfolgreicher Keycloak-Anmeldung blieb `app_user` leer.
-- Die Anmeldung selbst funktionierte (der Austausch stellt bewusst auch
-- ohne Datenbankprofil ein Token aus), aber `provisioned` war stets
-- `false` – und ohne Profilzeile greift keine einzige RLS-Policy, die
-- `auth.uid()` mit `app_user.id` vergleicht. Die Oberfläche zeigt dann
-- ihre Demo-Inhalte.
--
-- Ursache: `upsertAppUser` (netlify/functions/_lib/supabase.mjs) schreibt mit
--
--     on_conflict=issuer,tenant,subject
--
-- PostgREST erzeugt daraus `insert ... on conflict (issuer, tenant, subject)`
-- – ohne WHERE-Bedingung. Der Index aus 0003 war jedoch **partiell**:
--
--     create unique index app_user_external_identity
--       on app_user (issuer, tenant, subject)
--       where subject is not null;          <-- hier
--
-- Einen partiellen Index zieht Postgres zur Konfliktauflösung nur heran,
-- wenn die Anweisung dieselbe Bedingung mitbringt. Andernfalls:
--
--     42P10: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
--
-- Der Fehler trat bei jeder Anmeldung auf, blieb aber unsichtbar: Die
-- Funktion behandelt eine fehlgeschlagene Provisionierung absichtlich als
-- nicht fatal und protokolliert sie nur.
--
-- Behebung: Die Einschränkung ersatzlos streichen. Sie war ohnehin
-- entbehrlich – in einem gewöhnlichen Unique-Index gelten NULL-Werte als
-- voneinander verschieden. Mehrere Zeilen ohne `subject` bleiben also
-- erlaubt, genau wie zuvor. Die Eindeutigkeit für echte Identitäten
-- (issuer + tenant + subject) bleibt unverändert bestehen.
--
-- Gefahrlos wiederholbar.
-- ============================================================

drop index if exists app_user_external_identity;

create unique index if not exists app_user_external_identity
  on app_user (issuer, tenant, subject);

-- ---------- Kontrolle ----------
-- Muss eine Zeile liefern, und `indexdef` darf kein `WHERE` enthalten:
--
--   select indexdef from pg_indexes
--    where schemaname = 'public' and indexname = 'app_user_external_identity';
--
-- Gegenprobe – muss ohne Fehler durchlaufen und die Zeile danach wieder
-- entfernen (genau der Aufruf, den der Token-Austausch macht):
--
--   insert into app_user (issuer, tenant, subject, name)
--   values ('probe', 'probe', 'probe-1', 'Probeeintrag')
--   on conflict (issuer, tenant, subject) do update set name = excluded.name;
--
--   delete from app_user where issuer = 'probe';
