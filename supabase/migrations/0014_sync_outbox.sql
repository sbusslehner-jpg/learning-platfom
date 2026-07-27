-- ============================================================
-- 0014 – Ausstehende Abgleiche sichtbar machen (R-11)
--
-- BEFUND: Benutzeränderungen liefen in zwei Schritten – zuerst Keycloak über
-- die Serverfunktion, danach die Spiegelung nach Supabase IM BROWSER. Zwischen
-- beiden lag ein Netzwerkweg, ein Tab, der geschlossen werden kann, und ein
-- Token, das ablaufen kann.
--
-- Scheiterte der zweite Schritt, liefen Ansprüche und Spiegelung auseinander:
-- In Keycloak stand die neue Rolle, in der Plattform die alte. Das fällt
-- niemandem auf, weil beide Systeme für sich stimmig aussehen – bis jemand
-- fragt, warum eine Person etwas sieht oder nicht sieht.
--
-- Bei Rollen und Märkten war es schlimmer: Der Browser löschte erst alle
-- Zuordnungen und schrieb dann die neuen. Ein Abbruch dazwischen ließ die
-- Person GANZ OHNE Rolle zurück.
--
-- BEHEBUNG: Beide Schritte laufen jetzt in der Serverfunktion. Gelingt der
-- erste und scheitert der zweite auch nach Wiederholung, wird die Absicht hier
-- festgehalten, statt verloren zu gehen. Die Verwaltung sieht offene Einträge
-- und kann sie erneut anstoßen.
--
-- Warum eine Tabelle und kein stiller erneuter Versuch: Ein Fehlschlag, den
-- niemand sieht, ist ein Fehlschlag, den niemand behebt.
--
-- Gefahrlos wiederholbar.
-- ============================================================

create table if not exists sync_outbox (
  id           bigserial   primary key,
  created_at   timestamptz not null default now(),
  -- Was abgeglichen werden soll, z. B. 'user.roles'
  kind         text        not null,
  -- Kennung im FÜHRENDEN System (Keycloak), nicht in der Spiegelung: Beim
  -- Löschen gibt es die app_user-Zeile unter Umständen schon nicht mehr.
  external_id  text        not null,
  -- Kennung in der Spiegelung, soweit bekannt.
  app_user_id  uuid,
  -- Der gewünschte Zielzustand, nicht die Änderung. Ein erneuter Versuch soll
  -- denselben Endzustand herstellen, egal wie oft er läuft.
  payload      jsonb       not null default '{}'::jsonb,
  attempts     integer     not null default 1,
  last_error   text,
  last_try_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  -- Wer die Änderung ausgelöst hat – für die Nachfrage, nicht für die Technik.
  actor_label  text
);

comment on table sync_outbox is
  'Offene Abgleiche zwischen Keycloak und der Spiegelung in der Plattform. '
  'Eine Zeile bedeutet: Die Aenderung IST in Keycloak passiert, die Spiegelung '
  'noch nicht. Aufgeloest wird sie ueber /api/admin/user/reconcile.';

create index if not exists sync_outbox_open_idx
  on sync_outbox (created_at) where resolved_at is null;

-- Ein Eintrag je Art und Ziel genügt: Der Payload beschreibt den Zielzustand,
-- nicht eine Abfolge von Änderungen. Zwei offene Einträge für dieselbe Rolle
-- desselben Benutzers wären derselbe Auftrag zweimal.
create unique index if not exists sync_outbox_pending_unique
  on sync_outbox (kind, external_id) where resolved_at is null;

alter table sync_outbox enable row level security;

-- Lesen darf die Verwaltung – sie muss sehen, dass etwas offen ist.
-- Schreiben ausschließlich die Serverfunktion mit Dienstschlüssel.
grant select on sync_outbox to authenticated;
revoke insert, update, delete on sync_outbox from authenticated;
revoke all on sync_outbox from anon;

drop policy if exists "sync_outbox_select" on sync_outbox;
create policy "sync_outbox_select" on sync_outbox for select to authenticated
  using (auth_is_admin());

-- ─── Kontrolle ───────────────────────────────────────────────────────────────
--
--   select kind, external_id, attempts, last_error, created_at
--     from sync_outbox where resolved_at is null order by created_at;
--
-- Leeres Ergebnis heißt: Keycloak und Spiegelung stimmen überein.
