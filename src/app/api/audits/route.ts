import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAudit, runAudit } from "@/lib/brand-kit/audit";
import { normalizeWebsiteUrl } from "@/lib/scraper/url-guard";
import { requireWorkspace } from "@/lib/workspace";

// Scraping + Claude pueden tardar; la auditoría corre en `after` tras responder.
export const maxDuration = 300;

const BodySchema = z.object({ websiteUrl: z.string().min(3).max(2048) });

/** Inicia una auditoría de marca. Responde 202 con el id; el cliente consulta el estado. */
export async function POST(request: NextRequest) {
  const { supabase, workspace } = await requireWorkspace();

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Indica la URL de tu sitio web" }, { status: 400 });
  }
  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsiteUrl(parsed.data.websiteUrl).toString();
  } catch {
    return NextResponse.json({ error: "URL no válida" }, { status: 400 });
  }

  const { data: running } = await supabase
    .from("brand_audits")
    .select("id")
    .eq("workspace_id", workspace.id)
    .in("status", ["pending", "scraping", "analyzing"])
    .gte("created_at", new Date(Date.now() - maxDuration * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (running) {
    return NextResponse.json({ auditId: running.id, alreadyRunning: true }, { status: 202 });
  }

  const auditId = await createAudit(workspace.id, websiteUrl);
  after(() => runAudit(auditId, workspace.id, websiteUrl));
  return NextResponse.json({ auditId }, { status: 202 });
}

/** Estado de la última auditoría del workspace. */
export async function GET() {
  const { supabase, workspace } = await requireWorkspace();
  const { data, error } = await supabase
    .from("brand_audits")
    .select("id, status, error, website_url, created_at, completed_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ audit: data });
}
