import type { InstagramMedia } from "@/lib/instagram/api";

export type HourStat = { hour: number; posts: number; avgEngagement: number };

/** Hora local (0-23) de un instante en una zona horaria. */
function localHour(iso: string, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
}

/**
 * Engagement medio (likes + comentarios) por hora de publicación, de mayor a menor.
 * Las horas con pocas publicaciones pesan menos (media suavizada hacia la media global).
 */
export function bestPostingHours(media: InstagramMedia[], timeZone: string, limit = 3): HourStat[] {
  if (media.length === 0) return [];
  const engagement = (m: InstagramMedia) => (m.like_count ?? 0) + (m.comments_count ?? 0);
  const globalAvg = media.reduce((sum, m) => sum + engagement(m), 0) / media.length;
  const PRIOR = 3; // publicaciones "virtuales" con la media global

  const byHour = new Map<number, { posts: number; total: number }>();
  for (const m of media) {
    const hour = localHour(m.timestamp, timeZone);
    const entry = byHour.get(hour) ?? { posts: 0, total: 0 };
    entry.posts += 1;
    entry.total += engagement(m);
    byHour.set(hour, entry);
  }

  return [...byHour.entries()]
    .map(([hour, { posts, total }]) => ({
      hour,
      posts,
      avgEngagement: Math.round(total / posts),
      score: (total + PRIOR * globalAvg) / (posts + PRIOR),
    }))
    .sort((a, b) => b.score - a.score || b.posts - a.posts)
    .slice(0, limit)
    .map(({ hour, posts, avgEngagement }) => ({ hour, posts, avgEngagement }));
}
