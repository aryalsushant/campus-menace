-- Campus Menace: profiles, runs and leaderboards.
-- Clients never write tables directly: every write goes through a
-- security-definer function that checks the caller and the data.

create extension if not exists citext;

-- --------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);

alter table public.profiles enable row level security;

create policy "profiles are readable by signed-in players"
  on public.profiles for select
  to authenticated
  using (true);

-- ------------------------------------------------------------------- runs
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed bigint not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'active' check (status in ('active', 'done', 'rejected', 'abandoned')),
  score integer,
  distance real,
  takedowns integer,
  close_calls integer,
  duration_ms integer,
  cause text,
  reject_reason text
);

create index runs_user_idx on public.runs (user_id, started_at desc);
create index runs_board_idx on public.runs (status, finished_at desc, score desc);

alter table public.runs enable row level security;

create policy "players read their own runs"
  on public.runs for select
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------- usernames
create or replace function public.claim_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
  v_reserved text[] := array['admin', 'administrator', 'moderator', 'mod', 'support', 'campusmenace', 'campus_menace', 'official', 'staff', 'system', 'root', 'null', 'undefined'];
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Usernames are 3-16 letters, numbers or underscores' using errcode = '22023';
  end if;
  if lower(p_username) = any (v_reserved) then
    raise exception 'That username is reserved' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'You already picked a username' using errcode = '22023';
  end if;
  begin
    insert into public.profiles (id, username) values (v_uid, p_username) returning * into v_row;
  exception when unique_violation then
    raise exception 'That username is taken' using errcode = '23505';
  end;
  return v_row;
end;
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_username ~ '^[A-Za-z0-9_]{3,16}$'
     and not exists (select 1 from public.profiles where username = p_username::citext);
$$;

-- ------------------------------------------------------------------ runs
create or replace function public.start_run(p_seed bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'pick a username first' using errcode = '22023';
  end if;
  -- one run every 2 seconds at most
  if exists (select 1 from public.runs where user_id = v_uid and started_at > now() - interval '2 seconds') then
    raise exception 'slow down' using errcode = '22023';
  end if;
  update public.runs set status = 'abandoned' where user_id = v_uid and status = 'active';
  insert into public.runs (user_id, seed) values (v_uid, p_seed) returning id into v_id;
  return v_id;
end;
$$;

-- Plausibility checks against server time. The simulation caps speed at
-- ~24 m/s (×1.35 with cold brew), and pizza density is bounded by distance.
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
  v_prev_best integer;
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
  select coalesce(max(r.score), 0) into v_prev_best from public.runs r where r.user_id = v_uid and r.status = 'done';

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

  return query
    select
      case when v_reason is null then 'done' else 'rejected' end,
      greatest(v_prev_best, case when v_reason is null then p_score else 0 end),
      (select count(*) + 1 from (
         select r.user_id, max(r.score) as best from public.runs r where r.status = 'done' group by r.user_id
       ) b where b.best > greatest(v_prev_best, case when v_reason is null then p_score else 0 end)),
      v_reason is null and p_score > v_prev_best;
end;
$$;

-- ----------------------------------------------------------- leaderboards
create or replace function public.get_leaderboard(p_period text default 'all', p_limit integer default 50)
returns table (rank bigint, username citext, best integer, runs bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select r.user_id, r.score
    from public.runs r
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
  top_cause text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id, username from public.profiles where id = auth.uid()),
  mine as (select * from public.runs r where r.user_id = (select id from me) and r.status = 'done'),
  boards as (select r.user_id, max(r.score) as best from public.runs r where r.status = 'done' group by r.user_id)
  select
    (select username from me),
    coalesce((select max(score) from mine), 0),
    case when exists (select 1 from mine)
      then (select count(*) + 1 from boards where best > (select max(score) from mine))
      else null end,
    (select count(*) from mine),
    coalesce((select sum(score) from mine), 0),
    coalesce((select sum(takedowns) from mine), 0),
    coalesce((select max(distance) from mine), 0),
    (select cause from mine where cause is not null group by cause order by count(*) desc limit 1);
$$;

create or replace function public.get_recent_runs(p_limit integer default 10)
returns table (score integer, distance real, takedowns integer, cause text, finished_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select score, distance, takedowns, cause, finished_at
  from public.runs
  where user_id = auth.uid() and status = 'done'
  order by finished_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- only signed-in players may call these
revoke all on function public.claim_username(text) from public, anon;
revoke all on function public.username_available(text) from public, anon;
revoke all on function public.start_run(bigint) from public, anon;
revoke all on function public.finish_run(uuid, integer, real, integer, integer, integer, text) from public, anon;
revoke all on function public.get_leaderboard(text, integer) from public, anon;
revoke all on function public.get_my_stats() from public, anon;
revoke all on function public.get_recent_runs(integer) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.start_run(bigint) to authenticated;
grant execute on function public.finish_run(uuid, integer, real, integer, integer, integer, text) to authenticated;
grant execute on function public.get_leaderboard(text, integer) to authenticated;
grant execute on function public.get_my_stats() to authenticated;
grant execute on function public.get_recent_runs(integer) to authenticated;
