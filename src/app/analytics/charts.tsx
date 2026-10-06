import { Card } from "@/components/ui";
import type { GroupStat } from "@/lib/analytics/stats";

export const fmt = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
export const pct = (n: number) => `${pctFmt.format(n)} %`;

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Barras horizontales de una sola serie (reproducciones medias); el valor va como texto. */
export function Bars({ title, groups }: { title: string; groups: GroupStat[] }) {
  const max = Math.max(1, ...groups.map((g) => g.avgViews));
  return (
    <Card>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="mb-4 text-xs text-muted">Reproducciones medias por reel</p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted">Sin datos todavía.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li
              key={g.key}
              className="grid grid-cols-[minmax(0,9rem)_1fr_7.5rem] items-center gap-3 text-sm"
              title={`${g.key}: ${g.avgViews} reproducciones medias · ${pct(g.avgEngagementRate)} de engagement · ${g.reels} reels`}
            >
              <span className="truncate">{g.key.replaceAll("_", " ")}</span>
              <span className="h-3 rounded-r bg-background">
                <span className="block h-full rounded-r-[4px] bg-accent" style={{ width: `${(g.avgViews / max) * 100}%` }} />
              </span>
              {/* Columna de valores con ancho fijo: todas las pistas miden lo mismo y las barras son comparables. */}
              <span className="text-right tabular-nums text-muted">
                {fmt.format(g.avgViews)} · {pct(g.avgEngagementRate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
