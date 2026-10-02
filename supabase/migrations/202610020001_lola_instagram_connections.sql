create table if not exists public.lola_instagram_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  access_token text not null,
  expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lola_instagram_connections enable row level security;
revoke all on table public.lola_instagram_connections from anon, authenticated, public;
grant all on table public.lola_instagram_connections to service_role;

