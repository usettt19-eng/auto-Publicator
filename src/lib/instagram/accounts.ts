import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, refreshLongLivedToken, type LongLivedToken } from "./api";

/** Renueva el token cuando le quedan menos de 7 días. */
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function saveInstagramConnection(opts: {
  workspaceId: string;
  token: LongLivedToken;
  scopes: string[];
}) {
  const admin = createAdminClient();
  const profile = await getProfile(opts.token.access_token);

  const { data: account, error } = await admin
    .from("instagram_accounts")
    .upsert(
      {
        workspace_id: opts.workspaceId,
        ig_user_id: String(profile.user_id),
        username: profile.username,
        account_type: profile.account_type ?? null,
        profile_picture_url: profile.profile_picture_url ?? null,
        followers_count: profile.followers_count ?? null,
        media_count: profile.media_count ?? null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,ig_user_id" },
    )
    .select("id")
    .single();
  if (error) throw error;

  const { error: tokenError } = await admin.from("instagram_tokens").upsert({
    instagram_account_id: account.id,
    access_token_encrypted: encrypt(opts.token.access_token, env.tokenEncryptionKey()),
    expires_at: new Date(Date.now() + opts.token.expires_in * 1000).toISOString(),
    scopes: opts.scopes,
    refreshed_at: new Date().toISOString(),
  });
  if (tokenError) throw tokenError;

  return { accountId: account.id as string, profile };
}

/** Devuelve un token válido para la cuenta, renovándolo si está por caducar. */
export async function getAccessToken(instagramAccountId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("instagram_tokens")
    .select("access_token_encrypted, expires_at")
    .eq("instagram_account_id", instagramAccountId)
    .single();
  if (error) throw error;

  const key = env.tokenEncryptionKey();
  const token = decrypt(data.access_token_encrypted, key);
  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt - Date.now() > REFRESH_WINDOW_MS) return token;
  if (expiresAt <= Date.now()) {
    throw new Error("El token de Instagram caducó; vuelve a conectar la cuenta");
  }

  const refreshed = await refreshLongLivedToken(token);
  await admin
    .from("instagram_tokens")
    .update({
      access_token_encrypted: encrypt(refreshed.access_token, key),
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      refreshed_at: new Date().toISOString(),
    })
    .eq("instagram_account_id", instagramAccountId);
  return refreshed.access_token;
}
