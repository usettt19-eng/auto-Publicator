"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { parseBrandKit } from "@/lib/brand-kit/schema";
import { requireWorkspace } from "@/lib/workspace";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveBrandKit(input: unknown): Promise<SaveResult> {
  const { supabase, workspace } = await requireWorkspace();

  let kit;
  try {
    kit = parseBrandKit(input);
  } catch (err) {
    const detail = err instanceof ZodError ? err.issues[0]?.path.join(".") : undefined;
    return { ok: false, error: `Brand Kit no válido${detail ? ` (${detail})` : ""}` };
  }

  const { error } = await supabase
    .from("brand_kits")
    .update({ kit, edited_by_user: true, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };

  const { error: deleteError } = await supabase.from("content_pillars").delete().eq("workspace_id", workspace.id);
  if (deleteError) return { ok: false, error: deleteError.message };
  const { error: insertError } = await supabase.from("content_pillars").insert(
    kit.content_pillars.map((p, position) => ({
      workspace_id: workspace.id,
      name: p.name,
      description: p.description,
      example_topics: p.example_topics,
      position,
    })),
  );
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath("/dashboard");
  revalidatePath("/brand");
  return { ok: true };
}
