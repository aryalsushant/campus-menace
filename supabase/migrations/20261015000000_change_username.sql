-- Players can rename themselves from their profile, at most twice in any
-- seven days. Each rename is logged so the limit can be enforced.
create table public.username_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_username citext not null,
  new_username citext not null,
  changed_at timestamptz not null default now()
);

create index username_changes_user_idx on public.username_changes (user_id, changed_at desc);

alter table public.username_changes enable row level security;

create policy "players read their own username changes"
  on public.username_changes for select
  to authenticated
  using (user_id = auth.uid());

-- How many renames are left this week, and when the next one frees up.
create or replace function public.get_username_changes()
returns table (remaining integer, next_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select changed_at from public.username_changes
    where user_id = auth.uid() and changed_at > now() - interval '7 days'
  )
  select greatest(2 - count(*)::integer, 0),
         case when count(*) >= 2 then min(changed_at) + interval '7 days' end
  from recent;
$$;

create or replace function public.change_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
  v_old citext;
  v_reserved text[] := array['admin', 'administrator', 'moderator', 'mod', 'support', 'campusmenace', 'campus_menace', 'official', 'staff', 'system', 'root', 'null', 'undefined'];
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- lock the profile so two renames at once can't both slip under the limit
  select username into v_old from public.profiles where id = v_uid for update;
  if v_old is null then
    raise exception 'Pick a username first' using errcode = '22023';
  end if;
  if p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Usernames are 3-16 letters, numbers or underscores' using errcode = '22023';
  end if;
  if lower(p_username) = any (v_reserved) then
    raise exception 'That username is reserved' using errcode = '22023';
  end if;
  if v_old::text = p_username then
    raise exception 'That’s already your username' using errcode = '22023';
  end if;
  if (select count(*) from public.username_changes
      where user_id = v_uid and changed_at > now() - interval '7 days') >= 2 then
    raise exception 'You can only change your username twice a week' using errcode = '22023';
  end if;
  begin
    update public.profiles set username = p_username where id = v_uid returning * into v_row;
  exception when unique_violation then
    raise exception 'That username is taken' using errcode = '23505';
  end;
  insert into public.username_changes (user_id, old_username, new_username) values (v_uid, v_old, p_username);
  return v_row;
end;
$$;

revoke all on function public.get_username_changes() from public, anon;
revoke all on function public.change_username(text) from public, anon;
grant execute on function public.get_username_changes() to authenticated;
grant execute on function public.change_username(text) to authenticated;
