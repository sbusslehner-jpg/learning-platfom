-- ============================================================
-- 0012 – Medienablage für Videos, Bilder und Dokumente (R-03)
--
-- Bisher war Video ein simulierter Fortschrittsbalken, Bilder waren graue
-- Platzhalter und Dokumente öffneten bestenfalls einen externen Link. Es gab
-- keine Datei, keine Prüfung und keinen Zugriffsschutz.
--
-- Das Verfahren in drei Schritten:
--
--   1. Die Redaktion meldet eine Datei an. Der Server prüft Typ und Größe
--      gegen die Positivliste und legt eine `asset`-Zeile mit `status =
--      'pending'` sowie einen signierten Upload-Verweis an.
--   2. Der Browser lädt DIREKT in die Ablage. Der Umweg über die
--      Serverfunktion scheitert sonst an deren Grenzen für Anfragegröße und
--      Laufzeit – ein 40-MB-Video passt dort nicht durch.
--   3. Der Server prüft die abgelegte Datei nach: tatsächliche Größe und die
--      ersten Bytes gegen die Signatur des angegebenen Typs. Erst dann wird
--      sie `ready`. Fällt sie durch, wird sie gelöscht.
--
-- Warum die Prüfung NACH der Ablage steht: Wer direkt in die Ablage schreibt,
-- kann beim Anmelden alles behaupten. Geprüft werden muss deshalb, was
-- tatsächlich angekommen ist, nicht was angekündigt wurde. Bis zur Freigabe ist
-- die Datei über keinen Weg abrufbar – der Abruf gibt nur `ready`-Dateien aus.
--
-- Der Bucket ist privat. Es gibt keine öffentliche Adresse; jeder Abruf läuft
-- über eine kurzlebige signierte Adresse, die erst nach einer Rechteprüfung
-- erzeugt wird.
--
-- NICHT enthalten: Virenprüfung. Sie braucht einen externen Dienst
-- (ClamAV-Container oder Prüfdienst) und damit eine Entscheidung über Kosten
-- und Auftragsverarbeitung. Siehe docs/medien.md – der Punkt bleibt offen und
-- wird nicht als erledigt ausgewiesen.
--
-- Gefahrlos wiederholbar.
-- ============================================================

-- ─── 1. Ablage ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('training-media', 'training-media', false, 52428800)
on conflict (id) do update
  set public = false;   -- niemals öffentlich, auch nicht versehentlich

-- Die Obergrenze von 50 MB ist die Vorgabe des kostenlosen Supabase-Tarifs.
-- Für längere Schulungsvideos ist sie zu klein; sie lässt sich in einem
-- bezahlten Tarif anheben:
--   update storage.buckets set file_size_limit = 524288000 where id = 'training-media';
-- Der Server begrenzt zusätzlich je Elementtyp, siehe media-policy.mjs.

-- Es gibt bewusst KEINE Policy auf storage.objects für `authenticated`.
-- Sämtliche Zugriffe laufen über die Serverfunktion mit Dienstschlüssel, die
-- vorher die Rechte prüft. Eine Policy hier wäre ein zweiter, schwerer zu
-- überblickender Weg zum selben Ziel.
revoke all on storage.objects from anon, authenticated;

-- ─── 2. Zusatzangaben am Asset ───────────────────────────────────────────────

alter table asset add column if not exists size_bytes    bigint;
alter table asset add column if not exists original_name text;
alter table asset add column if not exists status        text not null default 'pending';
alter table asset add column if not exists uploaded_by   uuid references app_user(id) on delete set null;
alter table asset add column if not exists ready_at      timestamptz;
-- Nur zur Anzeige (Laufzeit im Player, Bildabmessungen). Stammt aus dem
-- Browser und ist deshalb nicht vertrauenswürdig – wird nirgends für eine
-- Entscheidung herangezogen.
alter table asset add column if not exists meta          jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asset_status_check') then
    alter table asset add constraint asset_status_check
      check (status in ('pending', 'ready', 'rejected'));
  end if;
end $$;

create index if not exists asset_element_idx on asset (element_id);
create index if not exists asset_status_idx  on asset (status) where status <> 'ready';

-- Ein Element trägt je Sprache höchstens eine Datei. `language_code is null`
-- ist die sprachunabhängige Fassung (ein Screenshot ohne Text, ein PDF, das
-- für alle Märkte gilt).
create unique index if not exists asset_element_language_idx
  on asset (element_id, coalesce(language_code, ''));

comment on column asset.status is
  'pending = angemeldet, noch nicht geprueft; ready = geprueft und abrufbar; '
  'rejected = Pruefung nicht bestanden, Datei geloescht.';

-- ─── 3. Sichtbarkeit ─────────────────────────────────────────────────────────
--
-- 0005 hat `asset_select` bereits an die Sichtbarkeit des Trainings gebunden.
-- Ergänzt wird: Lernende sehen nur geprüfte Dateien. Ein noch nicht geprüfter
-- oder abgelehnter Eintrag ist eine Redaktionsangelegenheit.

drop policy if exists "asset_select" on asset;
create policy "asset_select" on asset for select to authenticated
  using (
    exists (
      select 1
      from content_element e
      join chapter c on c.id = e.chapter_id
      where e.id = asset.element_id
        and auth_can_see_training(c.training_id)
    )
    and (status = 'ready' or auth_is_editor() or auth_is_admin())
  );

drop policy if exists "asset_write" on asset;
create policy "asset_write" on asset for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

-- ─── 4. Aufräumen ────────────────────────────────────────────────────────────

/**
 * Meldet Anmeldungen, die nie zu einer Datei geführt haben.
 *
 * Ein abgebrochener Upload hinterlässt eine `pending`-Zeile. Sie schadet
 * nicht, blockiert aber den eindeutigen Index für dieses Element und diese
 * Sprache – ein zweiter Versuch scheitert sonst an der ersten Leiche.
 */
create or replace function media_stale_uploads(p_older_than interval default interval '2 hours')
returns table (id uuid, element_id uuid, file_key text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.element_id, a.file_key, a.created_at
    from asset a
   where a.status = 'pending'
     and a.created_at < now() - p_older_than
   order by a.created_at;
$$;

revoke all on function media_stale_uploads(interval) from public, anon, authenticated;
grant execute on function media_stale_uploads(interval) to service_role;

-- ─── 5. Kontrolle ────────────────────────────────────────────────────────────
--
--   select id, public, file_size_limit from storage.buckets where id='training-media';
--     → public muss false sein
--
--   select column_name from information_schema.columns
--    where table_name='asset' and column_name in
--      ('size_bytes','original_name','status','uploaded_by','ready_at','meta');
--     → sechs Zeilen
