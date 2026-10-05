const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const version=fs.readFileSync('VERSION','utf8').trim();

test('Lola es un especialista independiente',()=>{
  assert.match(html,/LOLA REDES/);
  assert.match(html,/Volver a DoingLio/);
  assert.match(html,/https:\/\/duiliomf\.github\.io\/doinglio\//);
  assert.ok(/^\d+$/.test(version));
});

test('El enlace compartido de DoingLio no se duplica antes de entrar a Lola',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/body:not\(\.authenticated\) \.site-controls a\{display:none\}/);
  assert.match(html,/body\.authenticated #auth-shell/);
});

test('Lola conserva el acceso central',()=>{
  assert.match(html,/createClient/);
  assert.match(html,/signInWithOtp/);
  assert.match(html,/persistSession:true/);
});

test('Lola conserva sus cinco canales',()=>{
  for(const channel of ['Facebook','Instagram','WhatsApp','LinkedIn','TikTok']) assert.ok(html.includes(channel));
});

test('Lola usa una URL canónica de retorno para Magic Link',()=>{
  assert.match(html,/const LOLA_PUBLIC_URL='https:\/\/duiliomf\.github\.io\/lola-redes\/'/);
  assert.match(html,/emailRedirectTo:redirectTo/);
  assert.match(html,/const redirectTo=LOLA_PUBLIC_URL/);
});

test('Instagram se conecta desde el panel y muestra su estado',()=>{
  assert.match(html,/id="instagram-connect"/);
  assert.match(html,/id="instagram-status"/);
  assert.ok(html.includes("sb.functions.invoke('lola-instagram-oauth'"));
  assert.ok(html.includes("searchParams.get('instagram')"));
  assert.doesNotMatch(html,/access_token/);
});

test('OAuth oficial valida sesión y protege los tokens',()=>{
  const backend=fs.readFileSync('supabase/functions/lola-instagram-oauth/index.ts','utf8');
  const migration=fs.readFileSync('supabase/migrations/202610020001_lola_instagram_connections.sql','utf8');
  assert.ok(backend.includes('https://www.instagram.com/oauth/authorize'));
  assert.ok(backend.includes('META_APP_SECRET'));
  assert.ok(backend.includes('/auth/v1/user'));
  assert.ok(backend.includes('readState'));
  assert.ok(migration.toLowerCase().includes('enable row level security'));
  assert.ok(migration.includes('revoke all on table public.lola_instagram_connections from anon, authenticated, public'));
});

test('Lola guía la creación, preparación y conexión de Instagram sin exponer el bloqueo técnico',()=>{
  assert.match(html,/id="instagram-guide"/);
  assert.match(html,/LOLA TE ACOMPAÑA/);
  assert.match(html,/Creador o Empresa/);
  assert.match(html,/revisá la vista previa/);
  assert.match(html,/instagram_not_configured/);
  assert.match(html,/todavía se está preparando/);
  assert.doesNotMatch(html,/Falta configurar META_APP_ID/);
});

test('Crear cuenta de Instagram abre un enlace normal en otra pestaña',()=>{
  assert.match(html,/<a id="instagram-create" class="ig-create" href="https:\/\/www\.instagram\.com\/accounts\/signup\/" target="_blank" rel="noopener noreferrer">/);
  assert.doesNotMatch(html,/window\.open\('https:\/\/www\.instagram\.com\/accounts\/signup\//);
});


test('L10 separa el permiso de Instagram del usuario de Lola',()=>{
  const backend=fs.readFileSync('supabase/functions/lola-instagram-oauth/index.ts','utf8');
  const composer=fs.readFileSync('supabase/functions/lola-instagram-compose/index.ts','utf8');
  const migration=fs.readFileSync('supabase/migrations/202610040002_lola_instagram_profiles_global.sql','utf8');

  assert.match(html,/id="instagram-profile-select"/);
  assert.match(html,/id="instagram-available-select"/);
  assert.match(html,/id="instagram-link-existing"/);
  assert.match(html,/Autorizar otra cuenta/);
  assert.match(html,/Usar cuenta ya autorizada/);
  assert.match(html,/same_account/);
  assert.ok(html.includes("instagramAction('select'"));
  assert.ok(html.includes("instagramAction('add'"));
  assert.ok(html.includes("instagramAction('link'"));
  assert.doesNotMatch(html,/LOLA_LOCAL_URL|localInstagramHealth|Lola Local|127\.0\.0\.1:8791/);

  assert.ok(backend.includes('lola_instagram_profiles'));
  assert.ok(backend.includes('lola_instagram_profile_access'));
  assert.ok(backend.includes('lola_instagram_profile_selection'));
  assert.ok(backend.includes('active_account'));
  assert.ok(backend.includes('available_accounts'));
  assert.ok(backend.includes('body.action === "link"'));
  assert.ok(backend.includes('on_conflict=instagram_user_id'));
  assert.doesNotMatch(backend,/lola_instagram_accounts/);
  assert.doesNotMatch(backend,/lola_instagram_connections/);

  assert.ok(composer.includes('lola_instagram_profiles'));
  assert.ok(composer.includes('lola_instagram_profile_access'));
  assert.ok(composer.includes('lola_instagram_profile_selection'));
  assert.ok(composer.includes('getSelectedInstagramUserId'));
  assert.doesNotMatch(composer,/lola_instagram_accounts/);
  assert.doesNotMatch(composer,/lola_instagram_connections/);

  assert.ok(migration.includes('create table if not exists public.lola_instagram_profiles'));
  assert.ok(migration.includes('create table if not exists public.lola_instagram_profile_access'));
  assert.ok(migration.includes('from public.lola_instagram_accounts'));
  assert.ok(migration.includes('from public.lola_instagram_connections'));
  assert.ok(migration.includes('connected_by uuid'));
});


test('L11 acepta video MP4 y lo publica como Reel',()=>{
  const composer=fs.readFileSync('supabase/functions/lola-instagram-compose/index.ts','utf8');
  const migration=fs.readFileSync('supabase/migrations/202610040003_lola_instagram_video.sql','utf8');

  assert.match(html,/accept="image\/\*,video\/mp4"/);
  assert.match(html,/id="video-preview"/);
  assert.match(html,/Publicar Reel/);
  assert.ok(html.includes("uploadInstagramMedia"));
  assert.ok(html.includes("media_type:currentMediaType"));
  assert.ok(composer.includes('"REELS"'));
  assert.ok(composer.includes('"video_url"'));
  assert.ok(composer.includes('"share_to_feed", "true"'));
  assert.ok(composer.includes('publishMedia'));
  assert.ok(composer.includes('media_type: payload.mediaType'));
  assert.ok(migration.includes("video/mp4"));
  assert.ok(migration.includes("104857600"));
});


test('L12 permite Publicación, Reel e Historia',()=>{
  const composer=fs.readFileSync('supabase/functions/lola-instagram-compose/index.ts','utf8');
  const migration=fs.readFileSync('supabase/migrations/202610040004_lola_instagram_publish_type.sql','utf8');

  assert.match(html,/data-kind="post"/);
  assert.match(html,/data-kind="reel"/);
  assert.match(html,/data-kind="story"/);
  assert.match(html,/Publicar Historia/);
  assert.ok(html.includes("publish_type:currentPublishType"));
  assert.ok(html.includes("applyPublishType('post')"));
  assert.ok(composer.includes('"STORIES"'));
  assert.ok(composer.includes('"REELS"'));
  assert.ok(composer.includes('publish_type: payload.publishType'));
  assert.ok(composer.includes('publishType === "post"'));
  assert.ok(composer.includes('publishType === "reel"'));
  assert.ok(composer.includes('publishType !== "story"'));
  assert.ok(migration.includes("('post','reel','story')"));
});
