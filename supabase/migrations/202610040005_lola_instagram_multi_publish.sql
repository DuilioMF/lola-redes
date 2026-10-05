alter table public.lola_instagram_posts
  add column if not exists publish_types text[] not null default array['post']::text[],
  add column if not exists cover_image_url text,
  add column if not exists published_media jsonb not null default '{}'::jsonb;
