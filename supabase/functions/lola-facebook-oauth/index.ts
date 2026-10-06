const SITE_ORIGIN = "https://duiliomf.github.io";
const SITE_URL = SITE_ORIGIN + "/lola-redes/";
const FUNCTION_NAME = "lola-facebook-oauth";
const GRAPH_VERSION = Deno.env.get("FACEBOOK_GRAPH_VERSION") || "v26.0";
const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Vary": "Origin",
};

type OAuthState = { userId: string; expiresAt: number; nonce: string };
type PublicPage = { page_id: string; name: string; picture_url: string | null; connected_at: string; selected: boolean };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function redirectToSite(result: string): Response {
  const url = new URL(SITE_URL);
  url.searchParams.set("facebook", result);
  return Response.redirect(url.toString(), 303);
}

function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Falta configurar " + name + " en los secretos de Supabase.");
  return value;
}

function publishableKey(): string {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (typeof parsed?.default === "string" && parsed.default) return parsed.default;
    } catch (_) {}
  }
  return secret("SUPABASE_ANON_KEY");
}

function adminKey(): string {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (typeof parsed?.default === "string" && parsed.default) return parsed.default;
    } catch (_) {}
  }
  return secret("SUPABASE_SERVICE_ROLE_KEY");
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

async function signState(payload: OAuthState, signingKey: string): Promise<string> {
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

async function readState(value: string, signingKey: string): Promise<OAuthState | null> {
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
    const state = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as OAuthState;
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
    headers: { apikey: publishableKey(), Authorization: "Bearer " + match[1] },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === "string" ? { id: user.id } : null;
}

function adminHeaders(): HeadersInit {
  const key = adminKey();
  return { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
}

function restTable(table: string, query = ""): string {
  return secret("SUPABASE_URL") + "/rest/v1/" + table + query;
}

async function getAccessIds(userId: string): Promise<string[]> {
  const response = await fetch(
    restTable("lola_facebook_page_access", "?select=page_id&user_id=eq." + encodeURIComponent(userId)),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudieron consultar las páginas habilitadas.");
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map((row) => String(row.page_id || "")).filter(Boolean) : [];
}

async function getSelection(userId: string): Promise<string | null> {
  const response = await fetch(
    restTable("lola_facebook_page_selection", "?select=page_id&user_id=eq." + encodeURIComponent(userId) + "&limit=1"),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudo consultar la Página activa.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? String(rows[0].page_id || "") || null : null;
}

async function setSelection(userId: string, pageId: string): Promise<void> {
  const response = await fetch(restTable("lola_facebook_page_selection", "?on_conflict=user_id"), {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, page_id: pageId, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("No se pudo guardar la Página activa.");
}

async function clearSelection(userId: string): Promise<void> {
  const response = await fetch(
    restTable("lola_facebook_page_selection", "?user_id=eq." + encodeURIComponent(userId)),
    { method: "DELETE", headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudo limpiar la Página activa.");
}

async function listAllPages(): Promise<PublicPage[]> {
  const response = await fetch(
    restTable("lola_facebook_pages", "?select=page_id,name,picture_url,connected_at&order=connected_at.asc"),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudieron consultar las Páginas de Facebook.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row) => ({
        page_id: String(row.page_id || ""),
        name: String(row.name || "Facebook"),
        picture_url: row.picture_url || null,
        connected_at: row.connected_at || new Date(0).toISOString(),
        selected: false,
      })).filter((row) => row.page_id)
    : [];
}

async function grantAccess(userId: string, pageId: string): Promise<void> {
  const response = await fetch(restTable("lola_facebook_page_access", "?on_conflict=user_id,page_id"), {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, page_id: pageId }),
  });
  if (!response.ok) throw new Error("No se pudo habilitar la Página en Lola.");
}

async function removeAccess(userId: string, pageId: string): Promise<void> {
  const response = await fetch(
    restTable(
      "lola_facebook_page_access",
      "?user_id=eq." + encodeURIComponent(userId) + "&page_id=eq." + encodeURIComponent(pageId),
    ),
    { method: "DELETE", headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No se pudo quitar la Página de Lola.");
}

async function listPages(userId: string): Promise<PublicPage[]> {
  const [accessIds, pages] = await Promise.all([getAccessIds(userId), listAllPages()]);
  const allowed = new Set(accessIds);
  const result = pages.filter((page) => allowed.has(page.page_id));

  let selectedId = await getSelection(userId);
  if (selectedId && !allowed.has(selectedId)) selectedId = null;
  if (!selectedId && result.length) {
    selectedId = result[0].page_id;
    await setSelection(userId, selectedId);
  }

  return result.map((page) => ({ ...page, selected: page.page_id === selectedId }));
}

async function savePages(
  userId: string,
  pages: Array<{ id: string; name: string; access_token: string; picture_url: string | null }>,
): Promise<number> {
  if (!pages.length) throw new Error("La cuenta autorizada no administra ninguna Página de Facebook disponible para Lola.");
  const now = new Date().toISOString();
  for (const page of pages) {
    const response = await fetch(restTable("lola_facebook_pages", "?on_conflict=page_id"), {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        page_id: page.id,
        name: page.name,
        access_token: page.access_token,
        picture_url: page.picture_url,
        connected_by: userId,
        connected_at: now,
        updated_at: now,
      }),
    });
    if (!response.ok) throw new Error("No se pudo guardar la Página " + page.name + ".");
    await grantAccess(userId, page.id);
  }
  await setSelection(userId, pages[0].id);
  return pages.length;
}

async function selectPage(userId: string, pageId: string): Promise<PublicPage> {
  const pages = await listPages(userId);
  const target = pages.find((page) => page.page_id === pageId);
  if (!target) throw new Error("Esa Página no está habilitada para este acceso de Lola.");
  await setSelection(userId, pageId);
  return { ...target, selected: true };
}

async function disconnectPage(userId: string, pageId?: string): Promise<PublicPage[]> {
  const pages = await listPages(userId);
  const selectedId = pages.find((page) => page.selected)?.page_id || "";
  const target = pageId || selectedId;
  if (target) await removeAccess(userId, target);
  if (target && target === selectedId) await clearSelection(userId);
  return await listPages(userId);
}

async function authorizeUrl(userId: string): Promise<string> {
  const appId = secret("META_APP_ID");
  const appSecret = secret("META_APP_SECRET");
  const callback = secret("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/" + FUNCTION_NAME;
  const state = await signState(
    { userId, expiresAt: Date.now() + 10 * 60 * 1000, nonce: crypto.randomUUID() },
    appSecret,
  );

  const url = new URL("https://www.facebook.com/" + GRAPH_VERSION + "/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

async function exchangeCode(code: string): Promise<string> {
  const appId = secret("META_APP_ID");
  const appSecret = secret("META_APP_SECRET");
  const callback = secret("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/" + FUNCTION_NAME;

  const url = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/oauth/access_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("code", code);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || typeof data?.access_token !== "string") {
    throw new Error("Facebook no aceptó la autorización.");
  }

  const longUrl = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/oauth/access_token");
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", data.access_token);

  const longResponse = await fetch(longUrl);
  const longData = await longResponse.json();
  if (longResponse.ok && typeof longData?.access_token === "string") return longData.access_token;
  return data.access_token;
}

async function facebookPages(token: string): Promise<Array<{ id: string; name: string; access_token: string; picture_url: string | null }>> {
  const url = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/me/accounts");
  url.searchParams.set("fields", "id,name,access_token,picture{url}");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || !Array.isArray(data?.data)) {
    throw new Error("No pude leer las Páginas de Facebook administradas por esta cuenta.");
  }
  return data.data
    .map((page: any) => ({
      id: String(page?.id || ""),
      name: String(page?.name || "Facebook"),
      access_token: String(page?.access_token || ""),
      picture_url: page?.picture?.data?.url ? String(page.picture.data.url) : null,
    }))
    .filter((page: any) => page.id && page.access_token);
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
    const token = await exchangeCode(code);
    const pages = await facebookPages(token);
    const count = await savePages(state.userId, pages);
    return redirectToSite(count > 1 ? "connected_multiple" : "connected");
  } catch (error) {
    console.error("Facebook callback failed:", error instanceof Error ? error.message : "unknown");
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

    if (body.action === "start" || body.action === "add") {
      return json({ authorize_url: await authorizeUrl(user.id) });
    }

    if (body.action === "status") {
      const pages = await listPages(user.id);
      return json({
        connected: pages.length > 0,
        pages,
        active_page: pages.find((page) => page.selected) || null,
      });
    }

    if (body.action === "select") {
      const pageId = String(body.page_id || "").trim();
      if (!pageId) return json({ error: "missing_page_id" }, 400);
      const activePage = await selectPage(user.id, pageId);
      const pages = await listPages(user.id);
      return json({ connected: true, pages, active_page: activePage });
    }

    if (body.action === "disconnect") {
      const pageId = body.page_id ? String(body.page_id) : undefined;
      const pages = await disconnectPage(user.id, pageId);
      return json({
        connected: pages.length > 0,
        pages,
        active_page: pages.find((page) => page.selected) || null,
      });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("Facebook endpoint failed:", error instanceof Error ? error.message : "unknown");
    return json(
      {
        error: "facebook_unavailable",
        message: error instanceof Error ? error.message : "Facebook no está disponible.",
      },
      500,
    );
  }
});
