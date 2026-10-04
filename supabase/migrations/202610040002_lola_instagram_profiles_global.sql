create table if not exists public.lola_instagram_profiles (
  instagram_user_id text primary key,
  username text not null,
  access_token text not null,
  expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  connected_by uuid references auth.users (id) on delete set null,
  source text not null default 'oauth',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lola_instagram_profile_access (
  user_id uuid not null references auth.users (id) on delete cascade,
  instagram_user_id text not null references public.lola_instagram_profiles (instagram_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, instagram_user_id)
);

alter table public.lola_instagram_profiles enable row level security;
alter table public.lola_instagram_profile_access enable row level security;

revoke all on table public.lola_instagram_profiles from anon, authenticated, public;
revoke all on table public.lola_instagram_profile_access from anon, authenticated, public;

grant all on table public.lola_instagram_profiles to service_role;
grant all on table public.lola_instagram_profile_access to service_role;

with candidates as (
  select user_id, instagram_user_id, username, access_token, expires_at, granted_scopes,
         connected_at, updated_at, 'l9'::text as source
  from public.lola_instagram_accounts
  union all
  select user_id, instagram_user_id, username, access_token, expires_at, granted_scopes,
         connected_at, updated_at, 'legacy'::text as source
  from public.lola_instagram_connections
),
latest as (
  select distinct on (instagram_user_id)
         user_id, instagram_user_id, username, access_token, expires_at, granted_scopes,
         connected_at, updated_at, source
  from candidates
  where instagram_user_id is not null and access_token is not null
  order by instagram_user_id, updated_at desc nulls last, connected_at desc
)
insert into public.lola_instagram_profiles
  (instagram_user_id, username, access_token, expires_at, granted_scopes, connected_by, source, connected_at, updated_at)
select instagram_user_id, username, access_token, expires_at, granted_scopes, user_id, source,
       coalesce(connected_at, now()), coalesce(updated_at, now())
from latest
on conflict (instagram_user_id) do update set
  username = excluded.username,
  access_token = excluded.access_token,
  expires_at = excluded.expires_at,
  granted_scopes = excluded.granted_scopes,
  connected_by = excluded.connected_by,
  source = excluded.source,
  updated_at = excluded.updated_at;

insert into public.lola_instagram_profile_access (user_id, instagram_user_id)
select distinct user_id, instagram_user_id
from (
  select user_id, instagram_user_id from public.lola_instagram_accounts
  union all
  select user_id, instagram_user_id from public.lola_instagram_connections
) x
where exists (
  select 1 from public.lola_instagram_profiles p
  where p.instagram_user_id = x.instagram_user_id
)
on conflict do nothing;

insert into public.lola_instagram_profile_access (user_id, instagram_user_id)
select s.user_id, s.instagram_user_id
from public.lola_instagram_profile_selection s
where exists (
  select 1 from public.lola_instagram_profiles p
  where p.instagram_user_id = s.instagram_user_id
)
on conflict do nothing;
