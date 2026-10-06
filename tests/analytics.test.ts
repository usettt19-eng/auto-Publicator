import { describe, expect, it } from "vitest";
import { computeStats, weekStart, type ReelPerformance } from "@/lib/analytics/stats";
import { parseInsights } from "@/lib/instagram/api";

const reel = (id: string, views: number, reach: number, interactions: number, extra: Partial<ReelPerformance> = {}): ReelPerformance => ({
  reel_id: id,
  title: id,
  published_at: "2026-10-01T18:00:00Z",
  format: "tip",
  pillar: "Educación",
  views,
  reach,
  likes: interactions,
  comments: 0,
  shares: 0,
  saves: 0,
  total_interactions: interactions,
  ...extra,
});

describe("computeStats", () => {
  const rows = [
    reel("a", 1000, 800, 80),
    reel("b", 5000, 4000, 200, { format: "mito_vs_realidad", pillar: "Mitos" }),
    reel("c", 300, 250, 50),
    reel("d", 2000, 1500, 150, { pillar: null }),
  ];
  const stats = computeStats(rows);

  it("calcula totales, media y engagement global", () => {
    expect(stats.totals.views).toBe(8300);
    expect(stats.avgViews).toBe(2075);
    expect(stats.engagementRate).toBe(7.3); // 480 / 6550 = 7,33 %
  });

  it("agrupa por pilar y formato ordenando por reproducciones medias", () => {
    expect(stats.byPillar.map((g) => g.key)).toEqual(["Mitos", "Sin clasificar", "Educación"]);
    expect(stats.byFormat[0]).toEqual({ key: "mito_vs_realidad", reels: 1, avgViews: 5000, avgEngagementRate: 5 });
  });

  it("devuelve los mejores y peores", () => {
    expect(stats.top.map((r) => r.reel_id)).toEqual(["b", "d", "a"]);
    expect(stats.bottom.map((r) => r.reel_id)).toEqual(["c", "a", "d"]);
  });

  it("no divide por cero sin datos", () => {
    expect(computeStats([])).toMatchObject({ reels: 0, avgViews: 0, engagementRate: 0, top: [], bottom: [] });
  });
});

describe("weekStart", () => {
  it("devuelve el lunes de la semana", () => {
    expect(weekStart(new Date("2026-10-06T10:00:00Z"))).toBe("2026-10-05"); // martes
    expect(weekStart(new Date("2026-10-11T23:00:00Z"))).toBe("2026-10-05"); // domingo
    expect(weekStart(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05"); // lunes
  });
});

describe("parseInsights", () => {
  it("lee values y total_value, y usa 0 si falta una métrica", () => {
    expect(
      parseInsights({
        data: [
          { name: "views", values: [{ value: 1200 }] },
          { name: "reach", total_value: { value: 900 } },
          { name: "saved", values: [{ value: 14 }] },
          { name: "ig_reels_avg_watch_time", values: [{ value: 6400 }] },
        ],
      }),
    ).toEqual({ views: 1200, reach: 900, likes: 0, comments: 0, shares: 0, saves: 14, total_interactions: 0, avg_watch_time_ms: 6400 });
  });

  it("acepta la métrica antigua plays como reproducciones", () => {
    expect(parseInsights({ data: [{ name: "plays", values: [{ value: 50 }] }] }).views).toBe(50);
  });
});
