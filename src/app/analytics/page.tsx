import { Card, Header } from "@/components/ui";
import { loadPerformance, type WeeklyReport } from "@/lib/analytics/service";
import { computeStats, engagementRate } from "@/lib/analytics/stats";
import { requireWorkspace } from "@/lib/workspace";
import { AnalyticsActions } from "./analytics-actions";
import { Bars, fmt, pct, Stat } from "./charts";

export const maxDuration = 300;

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const { days: daysParam } = await searchParams;
  const days = daysParam === "7" ? 7 : 30;
  const { supabase, user, workspace } = await requireWorkspace();
  const [rows, { data: reportRow }] = await Promise.all([
    loadPerformance(workspace.id, days),
    supabase
      .from("weekly_reports")
      .select("week_start, report, ideas_added, created_at")
      .eq("workspace_id", workspace.id)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const stats = computeStats(rows);
  const report = reportRow?.report as WeeklyReport | undefined;

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Analíticas</h1>
          <nav className="flex gap-1 rounded-lg border border-border p-1 text-sm">
            {[7, 30].map((d) => (
              <a key={d} href={`/analytics?days=${d}`} className={`rounded-md px-3 py-1 ${d === days ? "bg-card font-medium" : "text-muted"}`}>
                {d} días
              </a>
            ))}
          </nav>
        </div>
        <AnalyticsActions />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Reproducciones" value={fmt.format(stats.totals.views)} hint={`${stats.reels} reels publicados`} />
          <Stat label="Alcance" value={fmt.format(stats.totals.reach)} />
          <Stat label="Engagement" value={pct(stats.engagementRate)} hint="interacciones / alcance" />
          <Stat label="Guardados y compartidos" value={fmt.format(stats.totals.saves + stats.totals.shares)} />
        </div>

        {report && (
          <Card className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted">Resumen de la semana del {new Date(reportRow!.week_start).toLocaleDateString()}</p>
              <h2 className="text-lg font-semibold">{report.headline}</h2>
              <p className="text-sm text-muted">{report.summary}</p>
            </div>
            {[
              ["Lo que funcionó", report.wins],
              ["Aprendizajes", report.learnings],
              ["Para la próxima semana", report.recommendations],
            ].map(([title, items]) =>
              (items as string[]).length ? (
                <div key={title as string}>
                  <h3 className="text-sm font-semibold">{title as string}</h3>
                  <ul className="ml-5 list-disc text-sm">
                    {(items as string[]).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            {reportRow!.ideas_added > 0 && (
              <p className="text-sm">
                Añadimos {reportRow!.ideas_added} ideas al plan.{" "}
                <a href="/ideas" className="text-accent hover:underline">
                  Ver ideas →
                </a>
              </p>
            )}
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Bars title="Por pilar de contenido" groups={stats.byPillar} />
          <Bars title="Por formato" groups={stats.byFormat} />
        </div>

        <Card className="overflow-x-auto">
          <h3 className="mb-3 font-semibold">Reels publicados</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay reels publicados en este periodo.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Reel</th>
                  <th className="py-2 text-right font-medium">Reproducciones</th>
                  <th className="py-2 text-right font-medium">Alcance</th>
                  <th className="py-2 text-right font-medium">Interacciones</th>
                  <th className="py-2 text-right font-medium">Guardados</th>
                  <th className="py-2 text-right font-medium">Engagement</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...rows]
                  .sort((a, b) => b.views - a.views)
                  .map((r) => (
                    <tr key={r.reel_id} className="border-t border-border">
                      <td className="max-w-64 truncate py-2">
                        {r.title}
                        <span className="block text-xs text-muted">{new Date(r.published_at).toLocaleDateString()}</span>
                      </td>
                      <td className="py-2 text-right">{fmt.format(r.views)}</td>
                      <td className="py-2 text-right">{fmt.format(r.reach)}</td>
                      <td className="py-2 text-right">{fmt.format(r.total_interactions)}</td>
                      <td className="py-2 text-right">{fmt.format(r.saves)}</td>
                      <td className="py-2 text-right">{pct(engagementRate(r))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </>
  );
}
