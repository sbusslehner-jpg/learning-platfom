-- ============================================================
-- 0013 – Zuweisungen atomar setzen
--
-- BEFUND: `setTrainingAssignment` im Browser löschte zuerst alle Gruppen- und
-- Einzelzuweisungen und schrieb danach die neuen. Das sind zwei bis vier
-- getrennte Anweisungen. Bricht eine der späteren ab – Netzabbruch,
-- abgelaufenes Token, verlorene Verbindung –, ist das Löschen bereits
-- geschehen und das Schreiben nicht.
--
-- Das Ergebnis wäre ein Training GANZ OHNE Zuweisung. Für Lernende, die es
-- über eine Gruppe gesehen haben, verschwindet es damit stillschweigend. Der
-- Redaktion fällt es nicht auf, weil die Oberfläche nur „Speichern
-- fehlgeschlagen" meldet – nicht, dass der vorherige Stand mit verloren ging.
--
-- Eine Funktion läuft in genau einer Transaktion. Damit gilt: ganz oder gar
-- nicht. Bei einem Fehler bleibt der vorherige Stand bestehen.
--
-- Die Funktion ist bewusst NICHT `security definer`: Die Rechteprüfung soll
-- weiterhin die RLS übernehmen (`training_group_write` / `training_user_write`
-- verlangen die Redaktionsrolle). Wer sie ohne Berechtigung aufruft, scheitert
-- an den Policies – nicht an einer zweiten, hier nachgebauten Prüfung.
--
-- Gefahrlos wiederholbar.
-- ============================================================

create or replace function set_training_assignment(
  p_training_id uuid,
  p_group_ids   uuid[],
  p_user_ids    uuid[]
)
returns void
language plpgsql
as $$
begin
  -- Ohne diese Prüfung liefe ein Aufruf mit unbekannter Kennung ins Leere und
  -- meldete trotzdem Erfolg.
  if not exists (select 1 from training where id = p_training_id) then
    raise exception 'Training % existiert nicht', p_training_id
      using errcode = 'no_data_found';
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

revoke all on function set_training_assignment(uuid, uuid[], uuid[]) from public, anon;
grant execute on function set_training_assignment(uuid, uuid[], uuid[]) to authenticated, service_role;

-- ─── Kontrolle ───────────────────────────────────────────────────────────────
--
-- Als Lernender muss der Aufruf an der RLS scheitern:
--   select set_training_assignment('<training>', '{}', '{}');
--   → ERROR: new row violates row-level security policy
