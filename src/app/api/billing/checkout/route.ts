import { NextResponse, type NextRequest } from "next/server";
import { createCheckoutUrl } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  const { user, workspace } = await requireWorkspace();
  if (workspace.owner_id !== user.id) return new NextResponse("Solo el dueño puede cambiar el plan", { status: 403 });
  const tier = (await request.formData()).get("tier");
  if (tier !== "self_serve" && tier !== "done_for_you") return new NextResponse("Plan no válido", { status: 400 });
  try {
    const url = await createCheckoutUrl({ workspaceId: workspace.id, email: user.email, tier, appUrl: env.appUrl() });
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    console.error("[billing/checkout]", err);
    return NextResponse.redirect(new URL("/billing?status=error", env.appUrl()), { status: 303 });
  }
}
