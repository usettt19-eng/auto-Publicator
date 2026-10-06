import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token firmado (HMAC-SHA256) para revisar un reel desde el email sin iniciar sesión.
 * Va ligado a la revisión: si el reel se regenera, los enlaces antiguos dejan de valer.
 */
export type ApprovalClaims = { reelId: string; revision: number; exp: number };

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function createApprovalToken(claims: ApprovalClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyApprovalToken(token: string, secret: string, now = Date.now()): ApprovalClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ApprovalClaims;
    if (typeof claims.reelId !== "string" || typeof claims.revision !== "number" || typeof claims.exp !== "number") return null;
    return claims.exp > now ? claims : null;
  } catch {
    return null;
  }
}

export const APPROVAL_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
