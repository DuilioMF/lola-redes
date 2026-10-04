const SITE_ORIGIN = "https://duiliomf.github.io";
const SITE_URL = SITE_ORIGIN + "/lola-redes/";
const FUNCTION_NAME = "lola-instagram-oauth";
const GRAPH_VERSION = Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "v26.0";
const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Vary": "Origin",
};

type InstagramState = { userId: string; expiresAt: number; nonce: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function redirectToSite(result: string): Response {
  const url = new URL(SITE_URL);
  url.searchParams.set("instagram", result);
  return Response.redirect(url.toString(), 303);
}

function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Falta configurar " + name + " en los secretos de Supabase.");
  return value;
}

function base64url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function signState(payload: InstagramState, signingKey: string): Promise<string> {
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return body + "." + base64url(new Uint8Array(signed));
}

async function readState(value: string, signingKey: string): Promise<InstagramState | null> {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("HMAC", key, fromBase64url(signature), new TextEncoder().encode(body))) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as InstagramState;
    if (typeof state.userId !== "string" || typeof state.expiresAt !== "number" ||
        state.expiresAt < Date.now() || state.expiresAt > Date.now() + 15 * 60 * 1000 ||
        typeof state.nonce !== "string") return null;
    return state;
  } catch { return null; }
}

async function authenticatedUser(request: Request): Promise<{ id: string } | null> {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const response = await fetch(secret("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: secret("SUPABASE_ANON_KEY"), Authorization: "Bearer " + match[1] },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? { id: user.id } : null;
}

function adminHeaders(): HeadersInit {
  const key = secret("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
}

function tableUrl(query = ""): string {
  return secret("SUPABASE_URL") + "/rest/v1/lola_instagram_connections" + query;
}

async function getConnection(userId: string): Promise<Record<string, unknown> | null> {
  const query = "?select=instagram_user_id,username,expires_at,connected_at&user_id=eq." + encodeURIComponent(userId) + "&limit=1";
  const response = await fetch(tableUrl(query), { headers: adminHeaders() });
  if (!response.ok) throw new Error("No se pudo consultar el estado de Instagram.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveConnection(userId: string, token: string, profile: { user_id: string; username: string }, expiresIn: number): Promise<void> {
  const now = new Date();
  const response = await fetch(tableUrl("?on_conflict=user_id"), {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId, instagram_user_id: profile.user_id, username: profile.username,
      access_token: token, expires_at: new Date(now.getTime() + expiresIn * 1000).toISOString(),
      granted_scopes: SCOPES, connected_at: now.toISOString(), updated_at: now.toISOString(),
    }),
  });
  if (!response.ok) throw new Error("No se pudo guardar la conexión de Instagram.");
}

async function removeConnection(userId: string): Promise<void> {
  const response = await fetch(tableUrl("?user_id=eq." + encodeURIComponent(userId)), {
    method: "DELETE", headers: adminHeaders(),
  });
  if (!response.ok) throw new Error("No se pudo desconectar Instagram.");
}

async function authorizeUrl(userId: string): Promise<string> {
  const appId = secret("META_APP_ID");
  const signingKey = secret("META_APP_SECRET");
  const callback = secret("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/" + FUNCTION_NAME;
  const state = await signState({ userId, expiresAt: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() }, signingKey);
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  // Siempre pedimos una autenticación fresca para que una sesión previa de Instagram
  // no ate silenciosamente Lola al perfil principal. La persona elige qué cuenta usar
  // en la pantalla oficial de Instagram; Lola nunca ve ni guarda la contraseña.
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_reauth", "true");
  url.searchParams.set("force_authentication", "1");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(code: string): Promise<{ token: string; expiresIn: number }> {
  const appId = secret("META_APP_ID");
  const appSecret = secret("META_APP_SECRET");
  const callback = secret("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/" + FUNCTION_NAME;
  const form = new URLSearchParams({
    client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: callback, code,
  });
  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  const shortToken = await shortResponse.json();
  if (!shortResponse.ok || typeof shortToken?.access_token !== "string") {
    throw new Error("Instagram no aceptó la autorización. Revisá la app de Meta y su URL de retorno.");
  }
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortToken.access_token);
  const longResponse = await fetch(longUrl);
  const longToken = await longResponse.json();
  if (!longResponse.ok || typeof longToken?.access_token !== "string") {
    throw new Error("Instagram autorizó la cuenta, pero no se pudo extender el acceso.");
  }
  return { token: longToken.access_token, expiresIn: Number(longToken.expires_in) || Number(shortToken.expires_in) || 0 };
}

async function profileFor(token: string): Promise<{ user_id: string; username: string }> {
  const url = new URL("https://graph.instagram.com/" + GRAPH_VERSION + "/me");
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const profile = await response.json();
  if (!response.ok || typeof profile?.user_id !== "string" || typeof profile?.username !== "string") {
    throw new Error("No pude leer el perfil de Instagram autorizado.");
  }
  return { user_id: profile.user_id, username: profile.username };
}

async function callback(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if (params.has("error")) return redirectToSite("cancelled");
  const code = params.get("code");
  const stateValue = params.get("state");
  if (!code || !stateValue) return redirectToSite("error");
  try {
    const state = await readState(stateValue, secret("META_APP_SECRET"));
    if (!state) return redirectToSite("error");
    const { token, expiresIn } = await exchangeCode(code);
    const profile = await profileFor(token);
    await saveConnection(state.userId, token, profile, expiresIn);
    return redirectToSite("connected");
  } catch (error) {
    console.error("Instagram callback failed:", error instanceof Error ? error.message : "unknown");
    return redirectToSite("error");
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method === "GET") return await callback(request);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const user = await authenticatedUser(request);
    if (!user) return json({ error: "unauthorized", message: "Volvé a entrar a Lola con tu mail." }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.action === "start" || body.action === "switch") {
      try { return json({ authorize_url: await authorizeUrl(user.id) }); }
      catch (error) {
        return json({ error: "instagram_not_configured", message: error instanceof Error ? error.message : "Falta configurar Instagram." }, 503);
      }
    }
    if (body.action === "status") {
      const account = await getConnection(user.id);
      return json({ connected: !!account, account });
    }
    if (body.action === "disconnect") {
      await removeConnection(user.id);
      return json({ connected: false });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("Instagram endpoint failed:", error instanceof Error ? error.message : "unknown");
    return json({ error: "instagram_unavailable", message: "Instagram no respondió. Probá de nuevo." }, 500);
  }
});
