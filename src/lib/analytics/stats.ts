export type ReelPerformance = {
  reel_id: string;
  title: string;
  published_at: string;
  format: string | null;
  pillar: string | null;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  total_interactions: number;
};

export type GroupStat = { key: string; reels: number; avgViews: number; avgEngagementRate: number };

export type PerformanceStats = {
  reels: number;
  totals: { views: number; reach: number; interactions: number; saves: number; shares: number };
  avgViews: number;
  /** Interacciones / alcance, en %. */
  engagementRate: number;
  byPillar: GroupStat[];
  byFormat: GroupStat[];
  top: ReelPerformance[];
  bottom: ReelPerformance[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
export const engagementRate = (r: Pick<ReelPerformance, "total_interactions" | "reach">) =>
  r.reach > 0 ? (r.total_interactions / r.reach) * 100 : 0;

function groupBy(rows: ReelPerformance[], key: (r: ReelPerformance) => string | null): GroupStat[] {
  const groups = new Map<string, ReelPerformance[]>();
  for (const r of rows) {
    const k = key(r) ?? "Sin clasificar";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([k, items]) => ({
      key: k,
      reels: items.length,
      avgViews: Math.round(items.reduce((s, r) => s + r.views, 0) / items.length),
      avgEngagementRate: round1(items.reduce((s, r) => s + engagementRate(r), 0) / items.length),
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

/** Resumen de rendimiento de un conjunto de reels publicados. */
export function computeStats(rows: ReelPerformance[]): PerformanceStats {
  const sum = (f: (r: ReelPerformance) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totals = {
    views: sum((r) => r.views),
    reach: sum((r) => r.reach),
    interactions: sum((r) => r.total_interactions),
    saves: sum((r) => r.saves),
    shares: sum((r) => r.shares),
  };
  // Ranking por reproducciones con el engagement como desempate.
  const ranked = [...rows].sort((a, b) => b.views - a.views || engagementRate(b) - engagementRate(a));
  return {
    reels: rows.length,
    totals,
    avgViews: rows.length ? Math.round(totals.views / rows.length) : 0,
    engagementRate: totals.reach ? round1((totals.interactions / totals.reach) * 100) : 0,
    byPillar: groupBy(rows, (r) => r.pillar),
    byFormat: groupBy(rows, (r) => r.format),
    top: ranked.slice(0, 3),
    bottom: rows.length > 3 ? ranked.slice(-3).reverse() : [],
  };
}

/** Lunes (UTC) de la semana de `date`, como YYYY-MM-DD. */
export function weekStart(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
