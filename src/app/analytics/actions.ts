"use server";

import { revalidatePath } from "next/cache";
import { generateWeeklyReport, syncWorkspaceInsights } from "@/lib/analytics/service";
import { requireWorkspace } from "@/lib/workspace";

export type AnalyticsResult = { ok: true; message: string } | { ok: false; error: string };

export async function refreshAnalyticsAction(): Promise<AnalyticsResult> {
  const { workspace } = await requireWorkspace();
  try {
    const updated = await syncWorkspaceInsights(workspace.id);
    revalidatePath("/analytics");
    return { ok: true, message: `${updated} reels actualizados` };
  } catch (err) {
    console.error("[analytics] sync", err);
    return { ok: false, error: err instanceof Error ? err.message : "No se pudieron leer las métricas" };
  }
}

export async function generateReportAction(): Promise<AnalyticsResult> {
  const { workspace } = await requireWorkspace();
  try {
    await syncWorkspaceInsights(workspace.id).catch(() => 0);
    await generateWeeklyReport(workspace.id, { force: true });
    revalidatePath("/analytics");
    revalidatePath("/ideas");
    return { ok: true, message: "Resumen generado; sus ideas están en Ideas" };
  } catch (err) {
    console.error("[analytics] report", err);
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar el resumen" };
  }
}
