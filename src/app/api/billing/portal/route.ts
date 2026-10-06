import { NextResponse } from "next/server";
import { createPortalUrl } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/workspace";

export async function POST() {
  const { user, workspace } = await requireWorkspace();
  if (workspace.owner_id !== user.id) return new NextResponse("Solo el dueño puede gestionar la facturación", { status: 403 });
  try {
    return NextResponse.redirect(await createPortalUrl({ workspaceId: workspace.id, appUrl: env.appUrl() }), { status: 303 });
  } catch (err) {
    console.error("[billing/portal]", err);
    return NextResponse.redirect(new URL("/billing?status=error", env.appUrl()), { status: 303 });
  }
}
