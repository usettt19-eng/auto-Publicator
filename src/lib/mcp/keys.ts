import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "ap_";

/** Genera una clave nueva. Solo se muestra una vez; en la BD se guarda el hash. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 10) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Extrae la clave de "Authorization: Bearer ap_…". */
export function bearerKey(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match && match[1].startsWith(API_KEY_PREFIX) ? match[1] : null;
}
