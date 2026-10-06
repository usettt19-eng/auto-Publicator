import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/** Variables leídas bajo demanda para que `next build` no falle sin ellas. */
export const env = {
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  instagramAppId: () => required("INSTAGRAM_APP_ID"),
  instagramAppSecret: () => required("INSTAGRAM_APP_SECRET"),
  tokenEncryptionKey: () => required("TOKEN_ENCRYPTION_KEY"),
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
};
