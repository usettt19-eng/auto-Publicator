/**
 * Cliente mínimo de la Instagram API con Instagram Login (graph.instagram.com).
 * Requiere una cuenta profesional (Business o Creator).
 */

export const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = "https://graph.instagram.com";

/** Cookie httpOnly con el `state` del flujo OAuth (protección CSRF). */
export const STATE_COOKIE = "ig_oauth_state";

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
] as const;

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string }; error_message?: string } | null)?.error?.message ??
      (body as { error_message?: string } | null)?.error_message ??
      `Instagram API respondió ${res.status}`;
    throw new InstagramApiError(message, res.status, body);
  }
  return body as T;
}

export function buildAuthorizeUrl(opts: { appId: string; redirectUri: string; state: string }) {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", opts.state);
  return url.toString();
}

type ShortLivedToken = { access_token: string; user_id: string | number; permissions?: string[] | string };

/** Intercambia el `code` del redirect por un token de corta duración (~1 h). */
export async function exchangeCodeForToken(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<ShortLivedToken> {
  const form = new URLSearchParams({
    client_id: opts.appId,
    client_secret: opts.appSecret,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
    // Instagram a veces añade "#_" al final del code.
    code: opts.code.replace(/#_$/, ""),
  });
  const body = await request<ShortLivedToken | { data: ShortLivedToken[] }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body: form },
  );
  const token = "data" in body ? body.data[0] : body;
  if (!token?.access_token) throw new InstagramApiError("Respuesta de token vacía", 500, body);
  return token;
}

export type LongLivedToken = { access_token: string; token_type: string; expires_in: number };

/** Token de larga duración (60 días). */
export function exchangeForLongLivedToken(opts: { appSecret: string; shortLivedToken: string }) {
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("access_token", opts.shortLivedToken);
  return request<LongLivedToken>(url.toString());
}

/** Renueva un token de larga duración (debe tener al menos 24 h y no haber caducado). */
export function refreshLongLivedToken(accessToken: string) {
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  return request<LongLivedToken>(url.toString());
}

export type InstagramProfile = {
  user_id: string;
  username: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  biography?: string;
};

export function getProfile(accessToken: string) {
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/me`);
  url.searchParams.set(
    "fields",
    "user_id,username,account_type,profile_picture_url,followers_count,media_count,biography",
  );
  url.searchParams.set("access_token", accessToken);
  return request<InstagramProfile>(url.toString());
}

export type InstagramMedia = {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

export async function getRecentMedia(accessToken: string, limit = 30): Promise<InstagramMedia[]> {
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", accessToken);
  const body = await request<{ data: InstagramMedia[] }>(url.toString());
  return body.data ?? [];
}
