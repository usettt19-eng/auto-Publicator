"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";

export type SettingsResult = { ok: true } | { ok: false; error: string };

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveSettings(input: { timezone: string; postingHour: number }): Promise<SettingsResult> {
  const { supabase, workspace } = await requireWorkspace();
  if (!isValidTimeZone(input.timezone)) return { ok: false, error: "Zona horaria no válida" };
  const hour = Math.round(input.postingHour);
  if (!(hour >= 0 && hour <= 23)) return { ok: false, error: "Hora no válida" };

  const { error } = await supabase
    .from("workspaces")
    .update({ timezone: input.timezone, posting_hour: hour })
    .eq("id", workspace.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
