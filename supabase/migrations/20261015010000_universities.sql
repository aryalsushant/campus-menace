-- Players can optionally pick their university. Picking one adds a
-- leaderboard of everyone at that school next to the global one.
create table public.universities (
  id integer primary key, -- the IPEDS unit id
  name text not null,
  city text not null,
  state text not null
);

alter table public.universities enable row level security;

create policy "universities are readable by signed-in players"
  on public.universities for select
  to authenticated
  using (true);

alter table public.profiles
  add column university_id integer references public.universities (id) on delete set null;

create index profiles_university_idx on public.profiles (university_id);

-- Sets (or with null, clears) the caller's university.
create or replace function public.set_university(p_university integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_university is not null and not exists (select 1 from public.universities where id = p_university) then
    raise exception 'Pick a university from the list' using errcode = '22023';
  end if;
  update public.profiles set university_id = p_university where id = v_uid;
  if not found then
    raise exception 'Pick a username first' using errcode = '22023';
  end if;
end;
$$;

-- The leaderboard, optionally limited to one university's players.
drop function public.get_leaderboard(text, integer);
create function public.get_leaderboard(p_period text default 'all', p_limit integer default 50, p_university integer default null)
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
    where p_university is null or p.university_id = p_university
  )
  select rank, username, best, runs, user_id = auth.uid() as is_me
  from ranked
  where rank <= least(greatest(p_limit, 1), 100) or user_id = auth.uid()
  order by rank, username;
$$;

-- Same stats as before plus the caller's rank at their university.
drop function public.get_my_stats();
create function public.get_my_stats()
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
  boards as (
    select r.user_id, max(r.score) as best, p.university_id
    from public.runs r join public.profiles p on p.id = r.user_id
    where r.status = 'done'
    group by r.user_id, p.university_id
  )
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
    (select cause from mine where cause is not null group by cause order by count(*) desc limit 1),
    case when exists (select 1 from mine) and (select university_id from me) is not null
      then (select count(*) + 1 from boards where university_id = (select university_id from me) and best > (select max(score) from mine))
      else null end;
$$;

revoke all on function public.set_university(integer) from public, anon;
revoke all on function public.get_leaderboard(text, integer, integer) from public, anon;
revoke all on function public.get_my_stats() from public, anon;
grant execute on function public.set_university(integer) to authenticated;
grant execute on function public.get_leaderboard(text, integer, integer) to authenticated;
grant execute on function public.get_my_stats() to authenticated;
