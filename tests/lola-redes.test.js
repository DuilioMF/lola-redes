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


test('L6 permite cambiar de perfil de Instagram sin heredar la sesión principal',()=>{
  const backend=fs.readFileSync('supabase/functions/lola-instagram-oauth/index.ts','utf8');
  assert.match(html,/id="instagram-change"/);
  assert.match(html,/Cambiar perfil/);
  assert.match(html,/La conexión actual se conserva si cancelás/);
  assert.ok(backend.includes('url.searchParams.set("force_reauth", "true")'));
  assert.ok(backend.includes('url.searchParams.set("enable_fb_login", "0")'));
});


test('L7 fuerza autenticacion real al cambiar de cuenta Instagram',()=>{
  const backend=fs.readFileSync('supabase/functions/lola-instagram-oauth/index.ts','utf8');
  assert.ok(backend.includes('body.action === "start" || body.action === "switch"'));
  assert.ok(backend.includes('url.searchParams.set("force_authentication", "1")'));
  assert.ok(backend.includes('url.searchParams.set("enable_fb_login", "0")'));
  assert.ok(html.includes("instagramAction('switch')"));
});


test('L8 usa Lola Local para multiples perfiles de Instagram',()=>{
  assert.match(html,/id="instagram-profile-select"/);
  assert.match(html,/LOLA_LOCAL_URL='http:\/\/127\.0\.0\.1:8791'/);
  assert.match(html,/localInstagramHealth/);
  assert.match(html,/\/publish-image/);
  assert.match(html,/\/select/);
  assert.match(html,/Lola Local/);
});
