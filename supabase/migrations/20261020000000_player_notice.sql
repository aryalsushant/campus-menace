-- One-time notices shown to a specific signed-in player.
create table public.player_notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

alter table public.player_notices enable row level security;

create or replace function public.claim_player_notice()
returns table (message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.player_notices
  set seen_at = now()
  where user_id = auth.uid()
    and seen_at is null
  returning player_notices.message;
end;
$$;

revoke all on function public.claim_player_notice() from public, anon;
grant execute on function public.claim_player_notice() to authenticated;

insert into public.player_notices (user_id, message)
select id, 'Bot activity detected. Using bots may result in a ban. Your score has been reset.'
from public.profiles
where lower(username::text) = 'youaintbsaugatfr';
