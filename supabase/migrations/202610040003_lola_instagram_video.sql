alter table public.lola_instagram_posts
  add column if not exists media_type text not null default 'image';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='lola_instagram_posts_media_type_check'
      and conrelid='public.lola_instagram_posts'::regclass
  ) then
    alter table public.lola_instagram_posts
      add constraint lola_instagram_posts_media_type_check
      check (media_type in ('image','video'));
  end if;
end $$;

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array['image/jpeg','video/mp4']::text[]
where id='instagram';
