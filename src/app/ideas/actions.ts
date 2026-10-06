"use server";

import { revalidatePath } from "next/cache";
import { PlanLimitError, planIdeas, produceReels } from "@/lib/reels/production";
import { requireWorkspace } from "@/lib/workspace";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function planIdeasAction(count: number): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const safeCount = Math.min(30, Math.max(1, Math.round(count)));
  try {
    const created = await planIdeas(workspace, safeCount);
    revalidatePath("/ideas");
    return { ok: true, message: `${created} ideas nuevas` };
  } catch (err) {
    console.error("[ideas] plan", err);
    return { ok: false, error: err instanceof Error ? err.message : "No se pudieron generar ideas" };
  }
}

export async function produceIdeasAction(ideaIds: string[]): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  if (!Array.isArray(ideaIds) || ideaIds.length === 0) return { ok: false, error: "Selecciona al menos una idea" };
  try {
    const created = await produceReels(workspace.id, ideaIds.slice(0, 50).map(String));
    revalidatePath("/ideas");
    revalidatePath("/reels");
    return { ok: true, message: `${created} reels en producción` };
  } catch (err) {
    if (err instanceof PlanLimitError) return { ok: false, error: err.message };
    console.error("[ideas] produce", err);
    return { ok: false, error: "No se pudieron crear los reels" };
  }
}

export async function discardIdeaAction(ideaId: string): Promise<ActionResult> {
  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase
    .from("reel_ideas")
    .update({ status: "discarded" })
    .eq("id", ideaId)
    .eq("workspace_id", workspace.id)
    .eq("status", "planned");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ideas");
  return { ok: true, message: "Idea descartada" };
}
