-- Sign-up asks for a username before the account exists, so signed-out
-- visitors can check availability too. Reserved names now report as taken.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_username ~ '^[A-Za-z0-9_]{3,16}$'
     and lower(p_username) <> all (array['admin', 'administrator', 'moderator', 'mod', 'support', 'campusmenace', 'campus_menace', 'official', 'staff', 'system', 'root', 'null', 'undefined'])
     and not exists (select 1 from public.profiles where username = p_username::citext);
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
