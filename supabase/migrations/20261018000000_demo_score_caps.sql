-- The demo accounts are played by hand now and then, and their old runs
-- come from when the game was easier. A capped account's scores count for
-- at most its cap wherever players are ranked, so they never outrank real
-- players with an unfair score. Personal run history keeps the real score.
create table public.score_caps (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cap integer not null check (cap >= 0)
);

-- no policies: only the functions below (and the secret key) can read it
alter table public.score_caps enable row level security;

-- Keyed by auth user so resetting a demo profile keeps its cap.
-- The seed script sets the same caps on new projects.
insert into public.score_caps (user_id, cap)
select p.id, 149
from public.profiles p
where p.username in ('pizza_goblin', 'scooter_slayer', 'late_to_class')
on conflict (user_id) do update set cap = excluded.cap;

-- least() ignores nulls, so uncapped players keep their score as is.
create or replace function public.get_leaderboard(p_period text default 'all', p_limit integer default 50, p_university integer default null)
returns table (rank bigint, username citext, best integer, runs bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select r.user_id, least(r.score, c.cap) as score
    from public.runs r
    left join public.score_caps c on c.user_id = r.user_id
    where r.status = 'done'
      and (
        p_period = 'all'
        or (p_period = 'week' and r.finished_at >= date_trunc('week', now()))
        or (p_period = 'day' and r.finished_at >= date_trunc('day', now()))
      )
  ),
  best as (
    select user_id, max(score) as best, count(*) as runs from scoped group by user_id
  ),
  ranked as (
    select rank() over (order by b.best desc) as rank, p.username, b.best, b.runs, b.user_id
    from best b join public.profiles p on p.id = b.user_id
    where p_university is null or p.university_id = p_university
  )
  select rank, username, best, runs, user_id = auth.uid() as is_me
  from ranked
  where rank <= least(greatest(p_limit, 1), 100) or user_id = auth.uid()
  order by rank, username;
$$;

create or replace function public.get_my_stats()
returns table (
  username citext,
  best integer,
  rank bigint,
  total_runs bigint,
  total_pizza bigint,
  total_takedowns bigint,
  longest real,
  top_cause text,
  school_rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id, username, university_id from public.profiles where id = auth.uid()),
  mine as (select * from public.runs r where r.user_id = (select id from me) and r.status = 'done'),
  my_best as (
    select least(max(m.score), (select cap from public.score_caps where user_id = (select id from me))) as best from mine m
  ),
  boards as (
    select r.user_id, max(least(r.score, c.cap)) as best, p.university_id
    from public.runs r
    join public.profiles p on p.id = r.user_id
    left join public.score_caps c on c.user_id = r.user_id
    where r.status = 'done'
    group by r.user_id, p.university_id
  )
  select
    (select username from me),
    coalesce((select best from my_best), 0),
    case when exists (select 1 from mine)
      then (select count(*) + 1 from boards where best > (select best from my_best))
      else null end,
    (select count(*) from mine),
    coalesce((select sum(score) from mine), 0),
    coalesce((select sum(takedowns) from mine), 0),
    coalesce((select max(distance) from mine), 0),
    (select cause from mine where cause is not null group by cause order by count(*) desc limit 1),
    case when exists (select 1 from mine) and (select university_id from me) is not null
      then (select count(*) + 1 from boards where university_id = (select university_id from me) and best > (select best from my_best))
      else null end;
$$;

-- Same checks as before; the best, rank and new-best it reports use capped scores.
create or replace function public.finish_run(
  p_run uuid,
  p_score integer,
  p_distance real,
  p_takedowns integer,
  p_close_calls integer,
  p_duration_ms integer,
  p_cause text
)
returns table (result_status text, best_score integer, best_rank bigint, new_best boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_run public.runs;
  v_elapsed_ms double precision;
  v_reason text := null;
  v_cap integer;
  v_prev_best integer;
  v_score integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into v_run from public.runs where id = p_run and user_id = v_uid for update;
  if not found then
    raise exception 'unknown run' using errcode = '22023';
  end if;
  if v_run.status <> 'active' then
    raise exception 'run already finished' using errcode = '22023';
  end if;

  v_elapsed_ms := extract(epoch from (now() - v_run.started_at)) * 1000;
  select cap into v_cap from public.score_caps where user_id = v_uid;
  select least(coalesce(max(r.score), 0), v_cap) into v_prev_best from public.runs r where r.user_id = v_uid and r.status = 'done';

  if p_score < 0 or p_distance < 0 or p_takedowns < 0 or p_close_calls < 0 or p_duration_ms < 0 then
    v_reason := 'negative values';
  elsif p_duration_ms > v_elapsed_ms + 3000 then
    v_reason := 'run longer than server time';
  elsif p_distance > (p_duration_ms / 1000.0) * 33 + 50 then
    v_reason := 'too fast';
  elsif p_score > p_distance * 0.75 + (p_takedowns + p_close_calls) * 4 + 60 then
    v_reason := 'too much pizza';
  elsif p_takedowns > p_distance / 8 + 5 then
    v_reason := 'too many takedowns';
  end if;

  update public.runs set
    finished_at = now(),
    status = case when v_reason is null then 'done' else 'rejected' end,
    score = p_score,
    distance = p_distance,
    takedowns = p_takedowns,
    close_calls = p_close_calls,
    duration_ms = p_duration_ms,
    cause = left(p_cause, 32),
    reject_reason = v_reason
  where id = p_run;

  v_score := case when v_reason is null then least(p_score, v_cap) else 0 end;
  return query
    select
      case when v_reason is null then 'done' else 'rejected' end,
      greatest(v_prev_best, v_score),
      (select count(*) + 1 from (
         select r.user_id, max(least(r.score, c.cap)) as best
         from public.runs r left join public.score_caps c on c.user_id = r.user_id
         where r.status = 'done' group by r.user_id
       ) b where b.best > greatest(v_prev_best, v_score)),
      v_reason is null and v_score > v_prev_best;
end;
$$;

revoke all on function public.get_leaderboard(text, integer, integer) from public, anon;
revoke all on function public.get_my_stats() from public, anon;
revoke all on function public.finish_run(uuid, integer, real, integer, integer, integer, text) from public, anon;
grant execute on function public.get_leaderboard(text, integer, integer) to authenticated;
grant execute on function public.get_my_stats() to authenticated;
grant execute on function public.finish_run(uuid, integer, real, integer, integer, integer, text) to authenticated;
