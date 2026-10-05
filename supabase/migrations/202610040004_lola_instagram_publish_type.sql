alter table public.lola_instagram_posts
  add column if not exists publish_type text not null default 'post';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='lola_instagram_posts_publish_type_check'
      and conrelid='public.lola_instagram_posts'::regclass
  ) then
    alter table public.lola_instagram_posts
      add constraint lola_instagram_posts_publish_type_check
      check (publish_type in ('post','reel','story'));
  end if;
end $$;
