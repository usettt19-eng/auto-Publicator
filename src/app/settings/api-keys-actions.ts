"use server";

import { revalidatePath } from "next/cache";
import { generateApiKey } from "@/lib/mcp/keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "@/lib/workspace";

export type CreateKeyResult = { ok: true; key: string } | { ok: false; error: string };

/** Crea una clave de API. La clave completa solo se devuelve aquí, una vez. */
export async function createApiKeyAction(name: string): Promise<CreateKeyResult> {
  const { user, workspace } = await requireWorkspace();
  const label = name.trim().slice(0, 60) || "Clave MCP";
  const { key, hash, prefix } = generateApiKey();
  const { error } = await createAdminClient()
    .from("api_keys")
    .insert({ workspace_id: workspace.id, user_id: user.id, name: label, key_prefix: prefix, key_hash: hash });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true, key };
}

export async function revokeApiKeyAction(id: string): Promise<{ ok: boolean }> {
  const { workspace } = await requireWorkspace();
  const { error } = await createAdminClient()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspace.id);
  revalidatePath("/settings");
  return { ok: !error };
}
