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
