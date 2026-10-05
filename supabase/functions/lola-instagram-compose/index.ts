import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GRAPH_VERSION = Deno.env.get("INSTAGRAM_GRAPH_VERSION") || "v26.0";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://duiliomf.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Falta configurar " + name + " en Supabase.");
  return value;
}

async function authenticatedUser(req: Request): Promise<{ id: string } | null> {
  const match = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
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

async function getSelectedInstagramUserId(userId: string): Promise<string | null> {
  const response = await fetch(
    secret("SUPABASE_URL") + "/rest/v1/lola_instagram_profile_selection" +
      "?select=instagram_user_id&user_id=eq." + encodeURIComponent(userId) + "&limit=1",
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No pude consultar el perfil activo de Instagram.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length
    ? String(rows[0].instagram_user_id || "") || null
    : null;
}

async function getAccessIds(userId: string): Promise<string[]> {
  const response = await fetch(
    secret("SUPABASE_URL") + "/rest/v1/lola_instagram_profile_access" +
      "?select=instagram_user_id&user_id=eq." + encodeURIComponent(userId),
    { headers: adminHeaders() },
  );
  if (!response.ok) throw new Error("No pude consultar los perfiles habilitados.");
  const rows = await response.json();
  return Array.isArray(rows)
    ? rows.map((row) => String(row.instagram_user_id || "")).filter(Boolean)
    : [];
}

async function fetchProfile(instagramUserId: string): Promise<any | null> {
  const url =
    secret("SUPABASE_URL") + "/rest/v1/lola_instagram_profiles" +
    "?select=instagram_user_id,username,access_token,expires_at" +
    "&instagram_user_id=eq." + encodeURIComponent(instagramUserId) +
    "&limit=1";
  const response = await fetch(url, { headers: adminHeaders() });
  if (!response.ok) throw new Error("No pude consultar la conexión de Instagram.");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getConnection(userId: string): Promise<any | null> {
  const accessIds = await getAccessIds(userId);
  if (!accessIds.length) return null;

  const selectedId = await getSelectedInstagramUserId(userId);
  if (selectedId && accessIds.includes(selectedId)) {
    const selected = await fetchProfile(selectedId);
    if (selected) return selected;
  }

  return await fetchProfile(accessIds[0]);
}

async function saveDraft(
  userId: string,
  payload: { mediaPath: string; mediaUrl: string; mediaType: "image" | "video"; brief: string; caption: string },
) {
  const url = secret("SUPABASE_URL") + "/rest/v1/lola_instagram_posts";
  const response = await fetch(url, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      image_path: payload.mediaPath,
      image_url: payload.mediaUrl,
      media_type: payload.mediaType,
      brief: payload.brief,
      caption: payload.caption,
      status: "draft",
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("No pude guardar el borrador.");
  const rows = await response.json();
  return rows?.[0] || null;
}

async function markPublished(
  userId: string,
  draftId: string | null,
  instagramUserId: string,
  mediaId: string,
) {
  if (!draftId) return;
  const url =
    secret("SUPABASE_URL") + "/rest/v1/lola_instagram_posts?id=eq." +
    encodeURIComponent(draftId) + "&user_id=eq." + encodeURIComponent(userId);
  await fetch(url, {
    method: "PATCH",
    headers: { ...adminHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      instagram_user_id: instagramUserId,
      instagram_media_id: mediaId,
      status: "published",
      error_message: null,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function markError(userId: string, draftId: string | null, message: string) {
  if (!draftId) return;
  const url =
    secret("SUPABASE_URL") + "/rest/v1/lola_instagram_posts?id=eq." +
    encodeURIComponent(draftId) + "&user_id=eq." + encodeURIComponent(userId);
  await fetch(url, {
    method: "PATCH",
    headers: { ...adminHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "error",
      error_message: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }),
  });
}

function extractOutputText(result: any): string {
  if (typeof result?.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }
  const parts = result?.output?.flatMap((o: any) => o?.content || []) || [];
  return parts
    .map((p: any) => p?.text)
    .filter((t: any) => typeof t === "string" && t.trim())
    .join("\n")
    .trim();
}

async function generateCaption(mediaUrl: string, brief: string, mediaType: "image" | "video"): Promise<string> {
  const openaiKey = secret("OPENAI_API_KEY");
  const kind = mediaType === "video" ? "video/Reel" : "foto";
  const prompt = `Sos Lola, especialista en redes sociales. Prepará UN texto listo para Instagram para un ${kind} con esta intención del usuario: "${brief}". No inventes datos. Español rioplatense natural. Agregá 3 a 7 hashtags. Máximo 1200 caracteres.`;
  const content: any[] = [{ type: "input_text", text: prompt }];
  if (mediaType === "image") content.push({ type: "input_image", image_url: mediaUrl, detail: "auto" });
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + openaiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", store: false, input: [{ role: "user", content }] }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "No pude generar el texto.");
  const caption = extractOutputText(result);
  if (!caption) throw new Error("Lola no devolvió un texto.");
  return caption.slice(0, 2200);
}

async function instagramRequest(url: string, body?: URLSearchParams, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.error_user_msg ||
      data?.error?.message ||
      "Instagram rechazó la publicación.";
    throw new Error(message);
  }
  return data;
}

async function waitForContainer(containerId: string, token: string, mediaType: "image" | "video"): Promise<void> {
  const attempts = mediaType === "video" ? 30 : 10;
  const delay = mediaType === "video" ? 4000 : 1200;
  for (let i = 0; i < attempts; i++) {
    const statusUrl = `https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
    const status = await instagramRequest(statusUrl, undefined, "GET");
    const code = String(status?.status_code || "");
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") throw new Error(status?.status || "Instagram no pudo procesar el archivo.");
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(mediaType === "video" ? "Instagram todavía está procesando el Reel. Probá Publicar otra vez en unos segundos." : "Instagram todavía está procesando la foto. Probá Publicar otra vez en unos segundos.");
}

async function publishMedia(connection: any, mediaUrl: string, caption: string, mediaType: "image" | "video") {
  const userId = String(connection.instagram_user_id);
  const token = String(connection.access_token);
  const createBody = new URLSearchParams({ caption: caption.slice(0, 2200), access_token: token });
  if (mediaType === "video") {
    createBody.set("media_type", "REELS");
    createBody.set("video_url", mediaUrl);
    createBody.set("share_to_feed", "true");
  } else {
    createBody.set("image_url", mediaUrl);
  }
  const created = await instagramRequest(`https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(userId)}/media`, createBody);
  if (!created?.id) throw new Error("Instagram no devolvió el contenedor.");
  const containerId = String(created.id);
  await waitForContainer(containerId, token, mediaType);
  const publishBody = new URLSearchParams({ creation_id: containerId, access_token: token });
  const published = await instagramRequest(`https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(userId)}/media_publish`, publishBody);
  if (!published?.id) throw new Error("Instagram no confirmó la publicación.");
  return String(published.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return json({ error: "unauthorized", message: "Volvé a entrar a Lola con tu mail." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "generate") {
      const mediaUrl = String(body?.media_url || body?.image_url || "").trim();
      const mediaPath = String(body?.media_path || body?.image_path || "").trim();
      const mediaType: "image" | "video" = String(body?.media_type || "image") === "video" ? "video" : "image";
      const brief = String(body?.brief || "").trim();
      if (!mediaUrl || !mediaPath) return json({ error: "missing_media", message: "Elegí una foto o un video primero." }, 400);
      if (!brief) return json({ error: "missing_brief", message: "Contame qué querés decir con la publicación." }, 400);
      const caption = await generateCaption(mediaUrl, brief, mediaType);
      const draft = await saveDraft(user.id, { mediaPath, mediaUrl, mediaType, brief, caption });
      return json({ ok: true, caption, draft_id: draft?.id || null, media_type: mediaType });
    }

    if (action === "publish") {
      const mediaUrl = String(body?.media_url || body?.image_url || "").trim();
      const mediaType: "image" | "video" = String(body?.media_type || "image") === "video" ? "video" : "image";
      const caption = String(body?.caption || "").trim();
      const draftId = body?.draft_id ? String(body.draft_id) : null;

      if (!mediaUrl || !caption) {
        return json({ error: "missing_content", message: "Falta el archivo o el texto." }, 400);
      }

      const connection = await getConnection(user.id);
      if (!connection) {
        return json(
          {
            error: "instagram_not_connected",
            message: "Primero habilitá un perfil de Instagram desde Lola.",
          },
          409,
        );
      }

      if (
        connection.expires_at &&
        new Date(connection.expires_at).getTime() <= Date.now()
      ) {
        return json(
          {
            error: "instagram_expired",
            message: "La autorización de ese perfil venció. Volvé a autorizarlo desde Lola.",
          },
          409,
        );
      }

      try {
        const mediaId = await publishMedia(connection, mediaUrl, caption, mediaType);
        await markPublished(
          user.id,
          draftId,
          String(connection.instagram_user_id),
          mediaId,
        );
        return json({
          ok: true,
          media_id: mediaId,
          media_type: mediaType,
          username: connection.username || null,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No pude publicar en Instagram.";
        await markError(user.id, draftId, message);
        return json({ error: "publish_failed", message }, 502);
      }
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error(
      "Lola Instagram compose failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return json(
      {
        error: "lola_unavailable",
        message: error instanceof Error ? error.message : "Lola no respondió.",
      },
      500,
    );
  }
});
