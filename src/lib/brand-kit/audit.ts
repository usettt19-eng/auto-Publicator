import "server-only";
import { getAccessToken } from "@/lib/instagram/accounts";
import { getProfile, getRecentMedia } from "@/lib/instagram/api";
import { scrapeWebsite } from "@/lib/scraper/scrape";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBrandKit, type InstagramSnapshot } from "./generate";

/** Crea el registro de auditoría en estado `pending`. */
export async function createAudit(workspaceId: string, websiteUrl: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand_audits")
    .insert({ workspace_id: workspaceId, website_url: websiteUrl, status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function loadInstagramSnapshot(workspaceId: string): Promise<InstagramSnapshot | null> {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("instagram_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!account) return null;

  const token = await getAccessToken(account.id);
  const [profile, media] = await Promise.all([getProfile(token), getRecentMedia(token, 30)]);
  return { profile, media };
}

/** Ejecuta la auditoría completa: scraping → Instagram → Claude → Brand Kit + pilares. */
export async function runAudit(auditId: string, workspaceId: string, websiteUrl: string) {
  const admin = createAdminClient();
  const setStatus = (fields: Record<string, unknown>) =>
    admin.from("brand_audits").update(fields).eq("id", auditId);

  try {
    await setStatus({ status: "scraping" });
    const website = await scrapeWebsite(websiteUrl);
    const instagram = await loadInstagramSnapshot(workspaceId).catch((err) => {
      // Instagram es opcional para la auditoría: seguimos solo con el sitio web.
      console.warn("[audit] no se pudo leer Instagram", err);
      return null;
    });
    await setStatus({ status: "analyzing", website_snapshot: website, instagram_snapshot: instagram });

    const kit = await generateBrandKit(website, instagram);

    const { error: kitError } = await admin.from("brand_kits").upsert(
      {
        workspace_id: workspaceId,
        source_audit_id: auditId,
        kit,
        edited_by_user: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );
    if (kitError) throw kitError;

    await admin.from("content_pillars").delete().eq("workspace_id", workspaceId);
    const { error: pillarsError } = await admin.from("content_pillars").insert(
      kit.content_pillars.map((p, position) => ({
        workspace_id: workspaceId,
        name: p.name,
        description: p.description,
        example_topics: p.example_topics,
        position,
      })),
    );
    if (pillarsError) throw pillarsError;

    await admin.from("workspaces").update({ website_url: website.url }).eq("id", workspaceId);
    await setStatus({ status: "completed", completed_at: new Date().toISOString() });
  } catch (err) {
    console.error("[audit] falló", err);
    await setStatus({
      status: "failed",
      error: err instanceof Error ? err.message : "Error desconocido",
      completed_at: new Date().toISOString(),
    });
  }
}
