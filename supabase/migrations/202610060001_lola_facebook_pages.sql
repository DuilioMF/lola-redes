create table if not exists public.lola_facebook_pages (
  page_id text primary key,
  name text not null,
  access_token text not null,
  picture_url text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lola_facebook_page_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null references public.lola_facebook_pages(page_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

create table if not exists public.lola_facebook_page_selection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  page_id text not null references public.lola_facebook_pages(page_id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.lola_facebook_pages enable row level security;
alter table public.lola_facebook_page_access enable row level security;
alter table public.lola_facebook_page_selection enable row level security;

revoke all on table public.lola_facebook_pages from anon, authenticated, public;
revoke all on table public.lola_facebook_page_access from anon, authenticated, public;
revoke all on table public.lola_facebook_page_selection from anon, authenticated, public;
