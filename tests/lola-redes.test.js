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
  assert.match(html,/body:not\\(\\.authenticated\\) \\.site-controls a\\{display:none\\}/);
  assert.match(html,/body\\.authenticated #auth-shell/);
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
