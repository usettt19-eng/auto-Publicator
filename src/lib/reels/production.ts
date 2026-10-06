import "server-only";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { currentPeriodStart, MONTHLY_REEL_LIMIT, remainingReels, type PlanTier } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateIdeaPlan } from "./content";
import { enqueueJob } from "./jobs";
import { spreadDates } from "./schedule";

export class PlanLimitError extends Error {}

export async function getUsage(workspaceId: string) {
  const admin = createAdminClient();
  const [{ data: sub }, { data: usage }] = await Promise.all([
    admin.from("subscriptions").select("tier").eq("workspace_id", workspaceId).maybeSingle(),
    admin
      .from("usage_counters")
      .select("reels_generated")
      .eq("workspace_id", workspaceId)
      .eq("period_start", currentPeriodStart())
      .maybeSingle(),
  ]);
  const tier = (sub?.tier ?? "free") as PlanTier;
  const used = usage?.reels_generated ?? 0;
  return { tier, used, limit: MONTHLY_REEL_LIMIT[tier], remaining: remainingReels(tier, used) };
}

/** Pide a Claude un plan de ideas y lo guarda con fechas repartidas en los próximos 30 días. */
export async function planIdeas(workspace: { id: string; timezone: string }, count: number) {
  const admin = createAdminClient();
  const [{ data: kitRow }, { data: pillars }, { data: existing }] = await Promise.all([
    admin.from("brand_kits").select("kit").eq("workspace_id", workspace.id).maybeSingle(),
    admin.from("content_pillars").select("id, name").eq("workspace_id", workspace.id),
    admin.from("reel_ideas").select("title").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(60),
  ]);
  if (!kitRow) throw new Error("Primero genera tu Brand Kit");

  const ideas = await generateIdeaPlan({
    kit: kitRow.kit as BrandKit,
    count,
    existingTitles: (existing ?? []).map((i) => i.title),
  });
  const pillarByName = new Map((pillars ?? []).map((p) => [p.name.toLowerCase().trim(), p.id]));
  const dates = spreadDates(ideas.length, 30, new Date(), workspace.timezone);

  const { error } = await admin.from("reel_ideas").insert(
    ideas.map((idea, i) => ({
      workspace_id: workspace.id,
      pillar_id: pillarByName.get(idea.pillar_name.toLowerCase().trim()) ?? null,
      title: idea.title,
      hook: idea.hook,
      format: idea.format,
      planned_for: dates[i],
    })),
  );
  if (error) throw error;
  return ideas.length;
}

/** Crea reels a partir de ideas, respetando el límite mensual del plan, y encola sus guiones. */
export async function produceReels(workspaceId: string, ideaIds: string[]) {
  const admin = createAdminClient();
  const { data: ideas, error } = await admin
    .from("reel_ideas")
    .select("id, title")
    .eq("workspace_id", workspaceId)
    .eq("status", "planned")
    .in("id", ideaIds);
  if (error) throw error;
  if (!ideas?.length) return 0;

  const usage = await getUsage(workspaceId);
  if (usage.remaining < ideas.length) {
    throw new PlanLimitError(
      `Tu plan permite ${usage.limit} reels al mes y te quedan ${usage.remaining}. Elige menos ideas o mejora tu plan.`,
    );
  }

  const { data: account } = await admin
    .from("instagram_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: reels, error: insertError } = await admin
    .from("reels")
    .insert(
      ideas.map((idea) => ({
        workspace_id: workspaceId,
        idea_id: idea.id,
        instagram_account_id: account?.id ?? null,
        title: idea.title,
        status: "queued",
      })),
    )
    .select("id");
  if (insertError) throw insertError;

  await admin.from("reel_ideas").update({ status: "in_production" }).in("id", ideas.map((i) => i.id));
  await admin.rpc("increment_usage", {
    p_workspace: workspaceId,
    p_period: currentPeriodStart(),
    p_field: "reels_generated",
    p_amount: reels.length,
  });
  for (const reel of reels) await enqueueJob(workspaceId, "generate_script", { reelId: reel.id });
  return reels.length;
}
