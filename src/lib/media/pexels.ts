/** Clips verticales de stock desde la API de Pexels (gratuita, requiere PEXELS_API_KEY). */

export type PexelsVideoFile = {
  link: string;
  width: number | null;
  height: number | null;
  file_type: string;
  quality?: string | null;
};
export type PexelsVideo = { id: number; duration: number; url: string; user?: { name: string }; video_files: PexelsVideoFile[] };

/** Elige el archivo MP4 vertical más cercano a 1080x1920 sin pasarse de 1920 de alto. */
export function pickVerticalFile(video: PexelsVideo): PexelsVideoFile | null {
  const candidates = video.video_files.filter(
    (f) => f.file_type === "video/mp4" && f.width && f.height && f.height > f.width && f.height >= 960,
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const score = (f: PexelsVideoFile) => Math.abs((f.height ?? 0) - 1920) + ((f.height ?? 0) > 1920 ? 2000 : 0);
    return score(a) - score(b);
  })[0];
}

export type StockClip = { url: string; pexelsId: number; pageUrl: string; author: string | null; duration: number };

export async function searchVerticalClip(query: string, opts: { apiKey: string; minDuration: number; exclude?: Set<number> }): Promise<StockClip | null> {
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", "15");
  const res = await fetch(url, { headers: { Authorization: opts.apiKey }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Pexels respondió ${res.status}`);
  const body = (await res.json()) as { videos: PexelsVideo[] };

  for (const video of body.videos ?? []) {
    if (opts.exclude?.has(video.id) || video.duration < opts.minDuration) continue;
    const file = pickVerticalFile(video);
    if (file) {
      return { url: file.link, pexelsId: video.id, pageUrl: video.url, author: video.user?.name ?? null, duration: video.duration };
    }
  }
  return null;
}
