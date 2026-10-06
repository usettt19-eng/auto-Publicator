import "server-only";
import { extractColors, extractFonts, extractPage, pickKeyPages, type PageExtract } from "./extract";
import { assertPublicHost, normalizeWebsiteUrl } from "./url-guard";

const USER_AGENT = "AutoPublicatorBot/1.0 (+brand audit)";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

/** fetch con validación SSRF en cada salto de redirección y límite de tamaño. */
async function safeFetchText(input: string, accept: string): Promise<{ url: string; body: string } | null> {
  let url = new URL(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      url = new URL(location, url);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      continue;
    }
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { url: url.toString(), body: Buffer.concat(chunks).toString("utf8") };
  }
  return null;
}

export type WebsiteSnapshot = {
  url: string;
  pages: Omit<PageExtract, "inlineCss" | "stylesheetUrls" | "links">[];
  colors: string[];
  fonts: string[];
  themeColor: string | null;
  logoCandidates: string[];
  socialLinks: string[];
};

/** Recorre la home y algunas páginas clave y resume la identidad visual. */
export async function scrapeWebsite(rawUrl: string): Promise<WebsiteSnapshot> {
  const start = normalizeWebsiteUrl(rawUrl);
  const home = await safeFetchText(start.toString(), "text/html");
  if (!home) throw new Error(`No se pudo descargar ${start.toString()}`);

  const homePage = extractPage(home.body, home.url);
  const subUrls = pickKeyPages(homePage.links, new URL(home.url).origin);
  const subPages = (
    await Promise.all(
      subUrls.map(async (u) => {
        const res = await safeFetchText(u, "text/html").catch(() => null);
        return res ? extractPage(res.body, res.url) : null;
      }),
    )
  ).filter((p): p is PageExtract => p !== null);

  const stylesheets = await Promise.all(
    homePage.stylesheetUrls.slice(0, 4).map((u) =>
      safeFetchText(u, "text/css")
        .then((r) => r?.body ?? "")
        .catch(() => ""),
    ),
  );
  const css = [homePage.inlineCss, ...stylesheets].join("\n");

  const pages = [homePage, ...subPages];
  return {
    url: home.url,
    pages: pages.map((p) => ({
      url: p.url,
      title: p.title,
      description: p.description,
      headings: p.headings,
      text: p.text,
      logoCandidates: p.logoCandidates,
      themeColor: p.themeColor,
      fontFamilies: p.fontFamilies,
      socialLinks: p.socialLinks,
    })),
    colors: extractColors(css),
    fonts: [...new Set([...homePage.fontFamilies, ...extractFonts(css)])].slice(0, 6),
    themeColor: homePage.themeColor,
    logoCandidates: homePage.logoCandidates,
    socialLinks: [...new Set(pages.flatMap((p) => p.socialLinks))],
  };
}
