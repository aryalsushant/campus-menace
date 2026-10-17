-- After a failed sign-in the game asks whether the email has an account,
-- so a new player can be offered sign-up instead of "wrong password".
create or replace function public.email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users where lower(email) = lower(trim(p_email)));
$$;

revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;
