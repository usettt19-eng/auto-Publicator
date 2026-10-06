"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/workspace";

export type RuleResult = { ok: true } | { ok: false; error: string };

const RuleSchema = z.object({
  id: z.string().uuid().optional(),
  keyword: z.string().trim().min(1, "Escribe la palabra clave").max(60),
  comment_reply: z.string().trim().max(300).nullable(),
  dm_message: z.string().trim().min(1, "Escribe el mensaje del DM").max(1000),
  link_url: z.union([z.literal(""), z.url("El enlace debe ser una URL completa (https://…)")]).nullable(),
  match_in: z.enum(["comments", "dms", "both"]),
  active: z.boolean(),
});
export type RuleInput = z.input<typeof RuleSchema>;

export async function saveRule(input: RuleInput): Promise<RuleResult> {
  const { supabase, workspace } = await requireWorkspace();
  const parsed = RuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const { id, ...rule } = parsed.data;
  const row = {
    ...rule,
    keyword: rule.keyword.toUpperCase(),
    comment_reply: rule.comment_reply || null,
    link_url: rule.link_url || null,
    workspace_id: workspace.id,
  };
  const { error } = id
    ? await supabase.from("keyword_rules").update(row).eq("id", id).eq("workspace_id", workspace.id)
    : await supabase.from("keyword_rules").insert(row);
  if (error) {
    return { ok: false, error: error.code === "23505" ? "Ya existe una regla con esa palabra clave" : error.message };
  }
  revalidatePath("/automations");
  return { ok: true };
}

export async function deleteRule(id: string): Promise<RuleResult> {
  const { supabase, workspace } = await requireWorkspace();
  const { error } = await supabase.from("keyword_rules").delete().eq("id", id).eq("workspace_id", workspace.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}

export async function setReplyMode(mode: "off" | "approval" | "auto"): Promise<RuleResult> {
  const { supabase, workspace } = await requireWorkspace();
  if (!["off", "approval", "auto"].includes(mode)) return { ok: false, error: "Modo no válido" };
  const { error } = await supabase.from("workspaces").update({ comment_reply_mode: mode }).eq("id", workspace.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}
