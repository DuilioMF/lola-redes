create table if not exists public.lola_instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  access_token text not null,
  expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  selected boolean not null default false,
  source text not null default 'oauth',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lola_instagram_accounts'::regclass
      and contype = 'u'
      and conname = 'lola_instagram_accounts_user_id_instagram_user_id_key'
  ) then
    alter table public.lola_instagram_accounts
      add constraint lola_instagram_accounts_user_id_instagram_user_id_key
      unique (user_id, instagram_user_id);
  end if;
end $$;

create unique index if not exists lola_instagram_accounts_one_selected_per_user
  on public.lola_instagram_accounts (user_id)
  where selected;

alter table public.lola_instagram_accounts enable row level security;
revoke all on table public.lola_instagram_accounts from anon, authenticated, public;
grant all on table public.lola_instagram_accounts to service_role;

insert into public.lola_instagram_accounts (
  user_id, instagram_user_id, username, access_token, expires_at,
  granted_scopes, selected, source, connected_at, updated_at
)
select
  user_id, instagram_user_id, username, access_token, expires_at,
  granted_scopes, false, 'legacy', connected_at, updated_at
from public.lola_instagram_connections
on conflict (user_id, instagram_user_id) do update
set username = excluded.username,
    access_token = excluded.access_token,
    expires_at = excluded.expires_at,
    granted_scopes = excluded.granted_scopes,
    updated_at = excluded.updated_at;

with first_account as (
  select distinct on (a.user_id) a.id, a.user_id
  from public.lola_instagram_accounts a
  where not exists (
    select 1
    from public.lola_instagram_accounts s
    where s.user_id = a.user_id and s.selected
  )
  order by a.user_id, a.connected_at asc, a.id
)
update public.lola_instagram_accounts a
set selected = true, updated_at = now()
from first_account f
where a.id = f.id;
