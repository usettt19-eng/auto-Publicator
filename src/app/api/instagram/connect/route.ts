import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildAuthorizeUrl, STATE_COOKIE } from "@/lib/instagram/api";
import { requireWorkspace } from "@/lib/workspace";

export async function GET() {
  await requireWorkspace();

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      appId: env.instagramAppId(),
      redirectUri: `${env.appUrl()}/api/instagram/callback`,
      state,
    }),
  );
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/instagram",
    maxAge: 600,
  });
  return response;
}
