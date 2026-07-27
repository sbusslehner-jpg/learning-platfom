-- Atomare Veröffentlichung mit serverseitiger Vollständigkeitsprüfung.
revoke create on schema public from public, anon, authenticated;

create or replace function publish_training(p_training_id uuid, p_market_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not auth_is_editor() then
    raise exception 'editor role required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_market_ids), 0) = 0 then
    raise exception 'at least one market required' using errcode = '23514';
  end if;
  if not exists (
    select 1 from training t
    where t.id = p_training_id and btrim(t.title) <> ''
  ) then
    raise exception 'training missing or title empty' using errcode = '23514';
  end if;
  if not exists (select 1 from chapter c where c.training_id = p_training_id)
     or exists (
       select 1 from chapter c
       where c.training_id = p_training_id
         and not exists (select 1 from content_element e where e.chapter_id = c.id)
     ) then
    raise exception 'every training needs chapters with content' using errcode = '23514';
  end if;
  if (select count(*) from market m where m.id = any(p_market_ids))
       <> cardinality(p_market_ids) then
    raise exception 'unknown market' using errcode = '23503';
  end if;

  delete from training_market where training_id = p_training_id;
  insert into training_market (training_id, market_id)
    select p_training_id, market_id from unnest(p_market_ids) market_id;
  update training
     set status = 'published', published_at = now(), updated_at = now()
   where id = p_training_id;
  return true;
end;
$$;

-- Fortschritt wird mit auth.uid() gebunden; der Browser kann weder eine
-- fremde user_id noch ein für ihn unsichtbares Kapitel angeben.
create or replace function complete_chapter(p_chapter_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from chapter c
     where c.id = p_chapter_id
       and auth_can_see_training(c.training_id)
  ) then
    raise exception 'chapter not accessible' using errcode = '42501';
  end if;

  insert into progress (user_id, chapter_id, viewed_at, completed)
  values (auth.uid(), p_chapter_id, now(), true)
  on conflict (user_id, chapter_id)
  do update set viewed_at = excluded.viewed_at, completed = true;
  return true;
end;
$$;

revoke all on function publish_training(uuid, uuid[]) from public, anon;
revoke all on function complete_chapter(uuid) from public, anon;
grant execute on function publish_training(uuid, uuid[]) to authenticated;
grant execute on function complete_chapter(uuid) to authenticated;

-- Aggregierte Berichte müssen alle Zeilen auswerten, ohne Rohdaten anderer
-- Lernender offenzulegen. security_invoker-Views sahen wegen RLS bislang nur
-- den eigenen Fortschritt und lieferten dadurch falsche Plattformzahlen.
create or replace function report_market_coverage_secure()
returns table (
  market_code text,
  market_name text,
  trainings_assigned bigint,
  languages bigint,
  users bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (auth_is_editor() or auth_is_admin()) then
    raise exception 'reporting role required' using errcode = '42501';
  end if;
  return query
    select mk.code, mk.name,
           count(distinct tm.training_id),
           count(distinct ml.language_code),
           count(distinct um.user_id)
      from market mk
      left join training_market tm on tm.market_id = mk.id
      left join market_language ml on ml.market_id = mk.id
      left join user_market um on um.market_id = mk.id
     group by mk.id, mk.code, mk.name
     order by mk.code;
end;
$$;

create or replace function report_learning_activity_secure()
returns table (
  active_learners bigint,
  chapters_completed bigint,
  completed_last_7d bigint,
  completed_last_30d bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (auth_is_editor() or auth_is_admin()) then
    raise exception 'reporting role required' using errcode = '42501';
  end if;
  return query
    select count(distinct pr.user_id),
           count(*),
           count(*) filter (where pr.viewed_at > now() - interval '7 days'),
           count(*) filter (where pr.viewed_at > now() - interval '30 days')
      from progress pr;
end;
$$;

revoke all on function report_market_coverage_secure() from public, anon;
revoke all on function report_learning_activity_secure() from public, anon;
grant execute on function report_market_coverage_secure() to authenticated;
grant execute on function report_learning_activity_secure() to authenticated;
