import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { saveInstagramConnection } from "@/lib/instagram/accounts";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  INSTAGRAM_SCOPES,
  STATE_COOKIE,
} from "@/lib/instagram/api";
import { requireWorkspace } from "@/lib/workspace";

function statesMatch(a: string | undefined | null, b: string | undefined | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest) {
  const { workspace } = await requireWorkspace();
  const params = request.nextUrl.searchParams;
  const dashboard = new URL("/dashboard", env.appUrl());

  const fail = (reason: string) => {
    dashboard.searchParams.set("instagram_error", reason);
    const res = NextResponse.redirect(dashboard);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/instagram" });
    return res;
  };

  if (params.get("error")) return fail(params.get("error_description") ?? "Acceso denegado");
  if (!statesMatch(params.get("state"), request.cookies.get(STATE_COOKIE)?.value)) {
    return fail("Estado OAuth inválido; inténtalo de nuevo");
  }
  const code = params.get("code");
  if (!code) return fail("Falta el código de autorización");

  try {
    const shortLived = await exchangeCodeForToken({
      appId: env.instagramAppId(),
      appSecret: env.instagramAppSecret(),
      redirectUri: `${env.appUrl()}/api/instagram/callback`,
      code,
    });
    const longLived = await exchangeForLongLivedToken({
      appSecret: env.instagramAppSecret(),
      shortLivedToken: shortLived.access_token,
    });
    const granted = shortLived.permissions;
    const scopes = Array.isArray(granted)
      ? granted
      : typeof granted === "string"
        ? granted.split(",")
        : [...INSTAGRAM_SCOPES];
    await saveInstagramConnection({ workspaceId: workspace.id, token: longLived, scopes });
  } catch (err) {
    console.error("[instagram/callback]", err);
    return fail("No se pudo conectar la cuenta de Instagram");
  }

  dashboard.searchParams.set("instagram", "connected");
  const res = NextResponse.redirect(dashboard);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/instagram" });
  return res;
}
