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
type PublicAccount = {
  instagram_user_id: string;
  username: string;
  expires_at: string | null;
  connected_at: string;
  selected: boolean;
};

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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return body + "." + base64url(new Uint8Array(signed));
}

async function readState(value: string, signingKey: string): Promise<InstagramState | null> {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (!await crypto.subtle.verify("HMAC", key, fromBase64url(signature), new TextEncoder().encode(body))) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as InstagramState;
    if (
      typeof state.userId !== "string" ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt < Date.now() ||
      state.expiresAt > Date.now() + 15 * 60 * 1000 ||
      typeof state.nonce !== "string"
    ) return null;
    return state;
  } catch {
    return null;
  }
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

function restTable(table: string, query = ""): string {
  return secret("SUPABASE_URL") + "/rest/v1/" + table + query;
}

async function getSelection(userId: string): Promise<string | null> {
  const response = await fetch(
    restTable(
      "lola_instagram_profile_selection",
      "?select=instagram_user_id&user_id=eq." + encodeURIComponent(userId) + "&limit=1",
    ),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudo consultar el perfil activo.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? String(rows[0].instagram_user_id || "") || null : null;
}

async function setSelection(userId: string, instagramUserId: string): Promise<void> {
  const response = await fetch(restTable("lola_instagram_profile_selection", "?on_conflict=user_id"), {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      instagram_user_id: instagramUserId,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("No se pudo guardar el perfil activo.");
}

async function clearSelection(userId: string): Promise<void> {
  const response = await fetch(
    restTable("lola_instagram_profile_selection", "?user_id=eq." + encodeURIComponent(userId)),
    { method: "DELETE", headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudo limpiar el perfil activo.");
}

async function getAccessIds(userId: string): Promise<string[]> {
  const response = await fetch(
    restTable(
      "lola_instagram_profile_access",
      "?select=instagram_user_id&user_id=eq." + encodeURIComponent(userId),
    ),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudieron consultar los perfiles habilitados.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row) => String(row.instagram_user_id || "")).filter(Boolean)
    : [];
}

async function listAllProfiles(): Promise<PublicAccount[]> {
  const response = await fetch(
    restTable(
      "lola_instagram_profiles",
      "?select=instagram_user_id,username,expires_at,connected_at&order=connected_at.asc",
    ),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudieron consultar los perfiles de Instagram.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row) => ({
        instagram_user_id: String(row.instagram_user_id || ""),
        username: String(row.username || "Instagram"),
        expires_at: row.expires_at || null,
        connected_at: row.connected_at || new Date(0).toISOString(),
        selected: false,
      })).filter((row) => row.instagram_user_id)
    : [];
}

async function grantAccess(userId: string, instagramUserId: string): Promise<void> {
  const response = await fetch(
    restTable("lola_instagram_profile_access", "?on_conflict=user_id,instagram_user_id"),
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, instagram_user_id: instagramUserId }),
    },
  );
  if (!response.ok) throw new Error("No se pudo habilitar el perfil en Lola.");
}

async function removeAccess(userId: string, instagramUserId: string): Promise<void> {
  const response = await fetch(
    restTable(
      "lola_instagram_profile_access",
      "?user_id=eq." + encodeURIComponent(userId) +
        "&instagram_user_id=eq." + encodeURIComponent(instagramUserId),
    ),
    { method: "DELETE", headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudo quitar el perfil de Lola.");
}

async function listAccounts(userId: string): Promise<PublicAccount[]> {
  const [accessIds, profiles] = await Promise.all([getAccessIds(userId), listAllProfiles()]);
  const allowed = new Set(accessIds);
  const accounts = profiles.filter((profile) => allowed.has(profile.instagram_user_id));

  let selectedId = await getSelection(userId);
  if (selectedId && !allowed.has(selectedId)) selectedId = null;
  if (!selectedId && accounts.length) {
    selectedId = accounts[0].instagram_user_id;
    await setSelection(userId, selectedId);
  }

  return accounts.map((account) => ({
    ...account,
    selected: account.instagram_user_id === selectedId,
  }));
}

async function listAvailableAccounts(userId: string): Promise<PublicAccount[]> {
  const [accessIds, profiles] = await Promise.all([getAccessIds(userId), listAllProfiles()]);
  const allowed = new Set(accessIds);
  return profiles.filter((profile) => !allowed.has(profile.instagram_user_id));
}

async function selectAccount(userId: string, instagramUserId: string): Promise<PublicAccount> {
  const accounts = await listAccounts(userId);
  const target = accounts.find((account) => account.instagram_user_id === instagramUserId);
  if (!target) throw new Error("Ese perfil no está habilitado para este acceso de Lola.");
  await setSelection(userId, instagramUserId);
  return { ...target, selected: true };
}

async function linkExisting(userId: string, instagramUserId: string): Promise<PublicAccount> {
  const profiles = await listAllProfiles();
  const target = profiles.find((profile) => profile.instagram_user_id === instagramUserId);
  if (!target) throw new Error("Ese perfil todavía no está autorizado en Lola.");
  await grantAccess(userId, instagramUserId);
  await setSelection(userId, instagramUserId);
  return { ...target, selected: true };
}

async function saveConnection(
  userId: string,
  token: string,
  profile: { user_id: string; username: string },
  expiresIn: number,
): Promise<{ newAccess: boolean }> {
  const accessBefore = await getAccessIds(userId);
  const now = new Date();
  const response = await fetch(restTable("lola_instagram_profiles", "?on_conflict=instagram_user_id"), {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      instagram_user_id: profile.user_id,
      username: profile.username,
      access_token: token,
      expires_at: expiresIn > 0 ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null,
      granted_scopes: SCOPES,
      connected_by: userId,
      source: "oauth",
      connected_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  });
  if (!response.ok) throw new Error("No se pudo guardar la autorización de Instagram.");

  await grantAccess(userId, profile.user_id);
  await setSelection(userId, profile.user_id);
  return { newAccess: !accessBefore.includes(profile.user_id) };
}

async function removeConnection(userId: string, instagramUserId?: string): Promise<PublicAccount[]> {
  const accounts = await listAccounts(userId);
  const selectedId = accounts.find((account) => account.selected)?.instagram_user_id || "";
  const target = instagramUserId || selectedId;

  if (target) await removeAccess(userId, target);
  if (target && target === selectedId) await clearSelection(userId);
  return await listAccounts(userId);
}

async function authorizeUrl(userId: string): Promise<string> {
  const appId = secret("META_APP_ID");
  const signingKey = secret("META_APP_SECRET");
  const callback =
    secret("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/" + FUNCTION_NAME;
  const state = await signState(
    { userId, expiresAt: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() },
    signingKey,
  );

  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(code: string): Promise<{ token: string; expiresIn: number }> {
  const appId = secret("META_APP_ID");
  const appSecret = secret("META_APP_SECRET");
  const callback =
    secret("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/" + FUNCTION_NAME;

  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: callback,
    code,
  });

  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const shortToken = await shortResponse.json();
  if (!shortResponse.ok || typeof shortToken?.access_token !== "string") {
    throw new Error("Instagram no aceptó la autorización.");
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

  return {
    token: longToken.access_token,
    expiresIn: Number(longToken.expires_in) || Number(shortToken.expires_in) || 0,
  };
}

async function profileFor(token: string): Promise<{ user_id: string; username: string }> {
  const url = new URL("https://graph.instagram.com/" + GRAPH_VERSION + "/me");
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const profile = await response.json();
  if (
    !response.ok ||
    typeof profile?.user_id !== "string" ||
    typeof profile?.username !== "string"
  ) throw new Error("No pude leer el perfil de Instagram autorizado.");

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
    const saved = await saveConnection(state.userId, token, profile, expiresIn);

    return redirectToSite(saved.newAccess ? "connected" : "same_account");
  } catch (error) {
    console.error(
      "Instagram callback failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return redirectToSite("error");
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method === "GET") return await callback(request);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await authenticatedUser(request);
    if (!user) {
      return json(
        { error: "unauthorized", message: "Volvé a entrar a Lola con tu mail." },
        401,
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body.action === "start" || body.action === "add" || body.action === "switch") {
      return json({ authorize_url: await authorizeUrl(user.id) });
    }

    if (body.action === "status") {
      const [accounts, availableAccounts] = await Promise.all([
        listAccounts(user.id),
        listAvailableAccounts(user.id),
      ]);
      return json({
        connected: accounts.length > 0,
        accounts,
        available_accounts: availableAccounts,
        active_account: accounts.find((account) => account.selected) || null,
      });
    }

    if (body.action === "select") {
      const instagramUserId = String(body.instagram_user_id || "").trim();
      if (!instagramUserId) return json({ error: "missing_instagram_user_id" }, 400);

      const activeAccount = await selectAccount(user.id, instagramUserId);
      const accounts = await listAccounts(user.id);
      return json({ connected: true, accounts, active_account: activeAccount });
    }

    if (body.action === "link") {
      const instagramUserId = String(body.instagram_user_id || "").trim();
      if (!instagramUserId) return json({ error: "missing_instagram_user_id" }, 400);

      const activeAccount = await linkExisting(user.id, instagramUserId);
      const [accounts, availableAccounts] = await Promise.all([
        listAccounts(user.id),
        listAvailableAccounts(user.id),
      ]);
      return json({
        connected: true,
        accounts,
        available_accounts: availableAccounts,
        active_account: activeAccount,
      });
    }

    if (body.action === "disconnect") {
      const instagramUserId = body.instagram_user_id
        ? String(body.instagram_user_id)
        : undefined;
      const accounts = await removeConnection(user.id, instagramUserId);
      return json({
        connected: accounts.length > 0,
        accounts,
        active_account: accounts.find((account) => account.selected) || null,
      });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error(
      "Instagram endpoint failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return json(
      {
        error: "instagram_unavailable",
        message: error instanceof Error ? error.message : "Instagram no respondió.",
      },
      500,
    );
  }
});
