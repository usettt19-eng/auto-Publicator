import "server-only";
import { z } from "zod";
import { generateStructured } from "@/lib/ai/claude";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { getAccessToken } from "@/lib/instagram/accounts";
import { getReelInsights } from "@/lib/instagram/api";
import { spreadDates } from "@/lib/reels/schedule";
import { REEL_FORMATS } from "@/lib/reels/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStats, weekStart, type PerformanceStats, type ReelPerformance } from "./stats";

// ---------------------------------------------------------------------------
// Sincronización de métricas
// ---------------------------------------------------------------------------

/** Lee las métricas de los reels publicados en los últimos 30 días. Devuelve cuántos actualizó. */
export async function syncWorkspaceInsights(workspaceId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: reels, error } = await admin
    .from("reels")
    .select("id, ig_media_id, instagram_account_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .not("ig_media_id", "is", null)
    .gte("published_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (error) throw error;
  if (!reels?.length) return 0;

  const tokens = new Map<string, string>();
  let updated = 0;
  const failures: string[] = [];
  for (const reel of reels) {
    if (!reel.instagram_account_id) continue;
    try {
      if (!tokens.has(reel.instagram_account_id)) tokens.set(reel.instagram_account_id, await getAccessToken(reel.instagram_account_id));
      const metrics = await getReelInsights(reel.ig_media_id as string, tokens.get(reel.instagram_account_id)!);
      const { error: upsertError } = await admin
        .from("reel_metrics")
        .upsert({ reel_id: reel.id, workspace_id: workspaceId, ...metrics, fetched_at: new Date().toISOString() });
      if (upsertError) throw upsertError;
      updated++;
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  // Si fallan todos, es un problema general (token, red): que el trabajo se reintente.
  if (updated === 0 && failures.length) throw new Error(`No se pudo leer ninguna métrica: ${failures[0]}`);
  return updated;
}

/** Reels publicados desde `since` con sus métricas, formato y pilar. */
export async function loadPerformance(workspaceId: string, sinceDays: number): Promise<ReelPerformance[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reels")
    .select("id, title, published_at, reel_ideas(format, content_pillars(name)), reel_metrics(views, reach, likes, comments, shares, saves, total_interactions)")
    .eq("workspace_id", workspaceId)
    .eq("status", "published")
    .gte("published_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString())
    .order("published_at", { ascending: false });
  if (error) throw error;

  type Row = {
    id: string;
    title: string | null;
    published_at: string;
    reel_ideas: { format: string | null; content_pillars: { name: string } | null } | null;
    reel_metrics: Omit<ReelPerformance, "reel_id" | "title" | "published_at" | "format" | "pillar"> | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    reel_id: r.id,
    title: r.title ?? "Reel",
    published_at: r.published_at,
    format: r.reel_ideas?.format ?? null,
    pillar: r.reel_ideas?.content_pillars?.name ?? null,
    views: r.reel_metrics?.views ?? 0,
    reach: r.reel_metrics?.reach ?? 0,
    likes: r.reel_metrics?.likes ?? 0,
    comments: r.reel_metrics?.comments ?? 0,
    shares: r.reel_metrics?.shares ?? 0,
    saves: r.reel_metrics?.saves ?? 0,
    total_interactions: r.reel_metrics?.total_interactions ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Resumen semanal
// ---------------------------------------------------------------------------

export const WeeklyReportSchema = z.object({
  headline: z.string().describe("Una frase con lo más importante de la semana"),
  summary: z.string().describe("2-3 frases"),
  wins: z.array(z.string()),
  learnings: z.array(z.string()).describe("Qué funciona y qué no, con datos"),
  recommendations: z.array(z.string()).describe("Acciones concretas para la próxima semana"),
  next_ideas: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      format: z.enum(REEL_FORMATS),
      pillar_name: z.string(),
    }),
  ),
});
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;

const REPORT_SYSTEM = `Eres analista de contenido de Instagram Reels.
Recibes las métricas de los reels de una marca y su Brand Kit. Escribe un resumen semanal útil y honesto.

- Basa cada conclusión en los datos; cita cifras concretas. Con pocos reels, dilo y sé prudente.
- Compara pilares y formatos: qué conviene repetir y qué conviene dejar.
- Las recomendaciones son acciones concretas (formato, tipo de hook, tema, hora), no generalidades.
- Propón 3-5 ideas para la próxima semana inspiradas en lo que mejor funcionó, usando nombres exactos de los pilares.
- Escribe en el idioma del Brand Kit.`;

function compactStats(stats: PerformanceStats) {
  const pick = (r: ReelPerformance) => ({ title: r.title, format: r.format, pillar: r.pillar, views: r.views, reach: r.reach, interactions: r.total_interactions, saves: r.saves, shares: r.shares });
  return { ...stats, top: stats.top.map(pick), bottom: stats.bottom.map(pick) };
}

/** Genera (o regenera con `force`) el informe de esta semana y añade sus ideas al plan. */
export async function generateWeeklyReport(workspaceId: string, opts: { force?: boolean } = {}) {
  const admin = createAdminClient();
  const week = weekStart();
  if (!opts.force) {
    const { data: existing } = await admin.from("weekly_reports").select("id").eq("workspace_id", workspaceId).eq("week_start", week).maybeSingle();
    if (existing) return existing.id as string;
  }

  const [lastWeek, lastMonth, { data: kitRow }, { data: pillars }, { data: ws }] = await Promise.all([
    loadPerformance(workspaceId, 7),
    loadPerformance(workspaceId, 30),
    admin.from("brand_kits").select("kit").eq("workspace_id", workspaceId).maybeSingle(),
    admin.from("content_pillars").select("id, name").eq("workspace_id", workspaceId),
    admin.from("workspaces").select("timezone").eq("id", workspaceId).single(),
  ]);
  if (!kitRow) throw new Error("El workspace no tiene Brand Kit");
  const kit = kitRow.kit as BrandKit;
  const stats = { last_7_days: computeStats(lastWeek), last_30_days: computeStats(lastMonth) };

  const report = await generateStructured({
    schema: WeeklyReportSchema,
    system: REPORT_SYSTEM,
    user: [
      `<brand_kit>${JSON.stringify({ brand_name: kit.brand_name, niche: kit.niche, language: kit.language, content_pillars: kit.content_pillars })}</brand_kit>`,
      `<metricas_7_dias>${JSON.stringify(compactStats(stats.last_7_days))}</metricas_7_dias>`,
      `<metricas_30_dias>${JSON.stringify(compactStats(stats.last_30_days))}</metricas_30_dias>`,
      "Escribe el resumen semanal.",
    ].join("\n"),
  });

  // Ajuste del calendario: las ideas propuestas entran al plan de la próxima semana.
  const ideas = report.next_ideas.slice(0, 5);
  const pillarByName = new Map((pillars ?? []).map((p) => [p.name.toLowerCase().trim(), p.id]));
  const dates = spreadDates(ideas.length, 7, new Date(), ws?.timezone ?? "UTC");
  if (ideas.length) {
    const { error } = await admin.from("reel_ideas").insert(
      ideas.map((idea, i) => ({
        workspace_id: workspaceId,
        pillar_id: pillarByName.get(idea.pillar_name.toLowerCase().trim()) ?? null,
        title: idea.title,
        hook: idea.hook,
        format: idea.format,
        planned_for: dates[i],
      })),
    );
    if (error) throw error;
  }

  const { data: saved, error } = await admin
    .from("weekly_reports")
    .upsert({ workspace_id: workspaceId, week_start: week, report, stats, ideas_added: ideas.length, created_at: new Date().toISOString() }, { onConflict: "workspace_id,week_start" })
    .select("id")
    .single();
  if (error) throw error;
  return saved.id as string;
}
