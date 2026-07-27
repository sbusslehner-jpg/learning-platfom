-- ============================================================
-- 0009 – Zuweisung von Trainings an Gruppen und einzelne Benutzer (R-02)
--
-- Bisher konnte ein Training ausschließlich Märkten zugeordnet werden. Damit
-- ließ sich „alle Serviceberater in Österreich" nicht abbilden und erst recht
-- nicht „diese drei Personen". Die Sichtbarkeit wird jetzt aus drei Quellen
-- gespeist, die sich ergänzen (nicht einschränken):
--
--     Markt      – wie bisher, über `training_market` und die Token-Claims
--     Gruppe     – über `training_group` und die Mitgliedschaft
--     Person     – über `training_user`, direkt
--
-- Ein Lernender sieht ein veröffentlichtes Training, sobald **eine** der drei
-- Regeln zutrifft. Redaktion und Verwaltung sehen weiterhin alles.
--
-- Warum additiv und nicht als Filterkette? Weil eine Zuweisung im Sprachgebrauch
-- der Fachseite eine Berechtigung erteilt, keine entzieht. Würde eine
-- Gruppenzuweisung die Marktsichtbarkeit einschränken, wäre jede spätere
-- Einzelzuweisung ein stiller Entzug für alle anderen – ein Fehler, der erst
-- auffällt, wenn sich jemand beschwert.
--
-- Gefahrlos wiederholbar.
-- ============================================================

-- ─── 1. Gruppen ──────────────────────────────────────────────────────────────

create table if not exists user_group (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  constraint user_group_name_unique unique (name)
);

create table if not exists group_member (
  group_id uuid not null references user_group(id) on delete cascade,
  user_id  uuid not null references app_user(id)   on delete cascade,
  primary key (group_id, user_id)
);

create index if not exists group_member_user_idx on group_member (user_id);

-- ─── 2. Zuweisungen ──────────────────────────────────────────────────────────

create table if not exists training_group (
  training_id uuid not null references training(id)  on delete cascade,
  group_id    uuid not null references user_group(id) on delete cascade,
  primary key (training_id, group_id)
);

create table if not exists training_user (
  training_id uuid not null references training(id) on delete cascade,
  user_id     uuid not null references app_user(id) on delete cascade,
  primary key (training_id, user_id)
);

create index if not exists training_group_group_idx on training_group (group_id);
create index if not exists training_user_user_idx   on training_user (user_id);

-- ─── 3. Sichtbarkeit erweitern ───────────────────────────────────────────────

/**
 * Ist der angemeldete Benutzer Mitglied dieser Gruppe?
 * `auth.uid()` zeigt auf `app_user.id` – das stellt der Token-Austausch sicher.
 */
create or replace function auth_in_group(p_group_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from group_member gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  );
$$;

/**
 * Darf der angemeldete Benutzer dieses Training sehen?
 *
 * Gegenüber 0005 kommen Gruppen- und Einzelzuweisung hinzu. Die
 * Marktsichtbarkeit bleibt unverändert – wer bisher etwas sah, sieht es weiter.
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

-- ─── 4. Rechte und Policies ──────────────────────────────────────────────────

grant select, insert, update, delete on user_group, group_member, training_group, training_user to authenticated;

alter table user_group     enable row level security;
alter table group_member   enable row level security;
alter table training_group enable row level security;
alter table training_user  enable row level security;

-- Gruppen: Verwaltung pflegt sie. Lesen darf jeder Angemeldete – sonst könnte
-- die Redaktion beim Zuweisen die Auswahlliste nicht füllen.
drop policy if exists "user_group_select" on user_group;
create policy "user_group_select" on user_group for select to authenticated
  using (true);
drop policy if exists "user_group_write" on user_group;
create policy "user_group_write" on user_group for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- Mitgliedschaften: Verwaltung pflegt sie; die eigene ist sichtbar, fremde
-- nur für Administratoren. Wer in welcher Gruppe ist, ist eine
-- personenbezogene Angabe und gehört nicht in jede Oberfläche.
drop policy if exists "group_member_select" on group_member;
create policy "group_member_select" on group_member for select to authenticated
  using (auth_is_admin() or user_id = auth.uid());
drop policy if exists "group_member_write" on group_member;
create policy "group_member_write" on group_member for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- Zuweisungen: Redaktion vergibt sie, sichtbar sind sie im Rahmen der
-- Trainingssichtbarkeit.
drop policy if exists "training_group_select" on training_group;
create policy "training_group_select" on training_group for select to authenticated
  using (auth_can_see_training(training_id));
drop policy if exists "training_group_write" on training_group;
create policy "training_group_write" on training_group for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

drop policy if exists "training_user_select" on training_user;
create policy "training_user_select" on training_user for select to authenticated
  using (auth_is_admin() or auth_is_editor() or user_id = auth.uid());
drop policy if exists "training_user_write" on training_user;
create policy "training_user_write" on training_user for all to authenticated
  using (auth_is_editor()) with check (auth_is_editor());

-- ─── 5. Kontrolle ────────────────────────────────────────────────────────────
--
-- Muss vier Zeilen liefern, alle mit rowsecurity = true:
--
--   select relname, relrowsecurity
--     from pg_class
--    where relname in ('user_group','group_member','training_group','training_user');
--
-- Sichtbarkeitsprobe für einen Lernenden ohne passenden Markt, der aber per
-- Gruppe zugewiesen ist – muss `true` liefern:
--
--   select auth_can_see_training('<training-id>');
