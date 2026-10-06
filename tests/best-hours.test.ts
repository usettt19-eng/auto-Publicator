import { describe, expect, it } from "vitest";
import type { InstagramMedia } from "@/lib/instagram/api";
import { bestPostingHours } from "@/lib/reels/best-hours";

const post = (timestamp: string, likes: number): InstagramMedia => ({ id: timestamp, media_type: "VIDEO", timestamp, like_count: likes, comments_count: 0 });

describe("bestPostingHours", () => {
  it("agrupa por hora local y ordena por engagement", () => {
    const media = [
      post("2026-09-01T17:10:00Z", 300), // 19:00 Madrid
      post("2026-09-02T17:40:00Z", 280),
      post("2026-09-03T17:05:00Z", 320),
      post("2026-09-04T07:00:00Z", 50), // 09:00
      post("2026-09-05T07:30:00Z", 70),
    ];
    const best = bestPostingHours(media, "Europe/Madrid");
    expect(best[0]).toEqual({ hour: 19, posts: 3, avgEngagement: 300 });
    expect(best[1].hour).toBe(9);
  });

  it("una sola publicación con mucho éxito no gana a una hora consistente", () => {
    const media = [
      post("2026-09-01T12:00:00Z", 600),
      ...Array.from({ length: 6 }, (_, i) => post(`2026-09-0${i + 2}T18:00:00Z`, 400)),
      ...Array.from({ length: 6 }, (_, i) => post(`2026-09-1${i}T08:00:00Z`, 20)),
    ];
    expect(bestPostingHours(media, "UTC")[0].hour).toBe(18);
  });

  it("sin publicaciones no sugiere nada", () => {
    expect(bestPostingHours([], "UTC")).toEqual([]);
  });
});
