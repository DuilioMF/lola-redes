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
  updated_at timestamptz not null default now(),
  unique (user_id, instagram_user_id)
);

create table if not exists public.lola_instagram_profile_selection (
  user_id uuid primary key references auth.users (id) on delete cascade,
  instagram_user_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.lola_instagram_accounts enable row level security;
alter table public.lola_instagram_profile_selection enable row level security;

revoke all on table public.lola_instagram_accounts from anon, authenticated, public;
revoke all on table public.lola_instagram_profile_selection from anon, authenticated, public;

grant all on table public.lola_instagram_accounts to service_role;
grant all on table public.lola_instagram_profile_selection to service_role;
