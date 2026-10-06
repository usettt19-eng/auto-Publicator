import * as cheerio from "cheerio";

export type PageExtract = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  links: string[];
  logoCandidates: string[];
  themeColor: string | null;
  inlineCss: string;
  stylesheetUrls: string[];
  fontFamilies: string[];
  socialLinks: string[];
};

const MAX_TEXT_CHARS = 12_000;
const SOCIAL_HOSTS = ["instagram.com", "tiktok.com", "facebook.com", "youtube.com", "linkedin.com", "x.com", "twitter.com"];

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function unique<T>(items: (T | null | undefined)[]): T[] {
  return [...new Set(items.filter((i): i is T => i != null && i !== ""))];
}

/** Extrae lo relevante para la marca de una página HTML. */
export function extractPage(html: string, url: string): PageExtract {
  const $ = cheerio.load(html);

  const inlineCss = [
    ...$("style")
      .toArray()
      .map((el) => $(el).text()),
    ...$("[style]")
      .toArray()
      .map((el) => $(el).attr("style") ?? ""),
  ].join("\n");

  const stylesheetUrls = unique(
    $('link[rel="stylesheet"]')
      .toArray()
      .map((el) => absolute($(el).attr("href"), url)),
  );

  // Primero imágenes del header o enlazadas a la home; después cualquier "logo" (pueden ser de clientes).
  const imgSrc = (selector: string, max: number) =>
    $(selector)
      .toArray()
      .slice(0, max)
      .map((el) => absolute($(el).attr("src"), url));
  const logoCandidates = unique([
    ...imgSrc('header img, a[href="/"] img', 2),
    ...imgSrc('img[src*="logo" i], img[alt*="logo" i], img[class*="logo" i]', 3),
    absolute($('meta[property="og:image"]').attr("content"), url),
    absolute($('link[rel="apple-touch-icon"]').attr("href"), url),
    absolute($('link[rel~="icon"]').attr("href"), url),
  ]);

  const fontFamilies = unique(
    $('link[href*="fonts.googleapis.com"]')
      .toArray()
      .flatMap((el) => {
        const href = $(el).attr("href") ?? "";
        return [...href.matchAll(/family=([^&:]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, " "));
      }),
  );

  const links = unique(
    $("a[href]")
      .toArray()
      .map((el) => absolute($(el).attr("href"), url)),
  );

  $("script, style, noscript, svg, iframe, template").remove();
  const headings = unique(
    $("h1, h2, h3")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim()),
  ).slice(0, 40);
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);

  return {
    url,
    title: $("title").first().text().trim(),
    description:
      $('meta[name="description"]').attr("content")?.trim() ??
      $('meta[property="og:description"]').attr("content")?.trim() ??
      "",
    headings,
    text,
    links,
    logoCandidates,
    themeColor: $('meta[name="theme-color"]').attr("content")?.trim() ?? null,
    inlineCss,
    stylesheetUrls,
    fontFamilies,
    socialLinks: links.filter((l) => SOCIAL_HOSTS.some((h) => new URL(l).hostname.endsWith(h))),
  };
}

const HEX_RE = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB_RE = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi;
const NEUTRALS = new Set(["#ffffff", "#000000"]);

function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

/** Colores hex más frecuentes en el CSS (sin blanco/negro puros). */
export function extractColors(css: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  const add = (hex: string) => {
    if (!NEUTRALS.has(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  for (const match of css.matchAll(HEX_RE)) add(expandHex(match[0]));
  for (const [, r, g, b] of css.matchAll(RGB_RE)) {
    const channels = [r, g, b].map(Number);
    if (channels.every((c) => c <= 255)) add(`#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => hex);
}

const GENERIC_FONTS = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial",
  "unset", "-apple-system", "blinkmacsystemfont", "ui-sans-serif", "ui-serif", "ui-monospace",
  "segoe ui", "roboto", "helvetica", "helvetica neue", "arial", "apple color emoji",
  "segoe ui emoji", "segoe ui symbol", "noto color emoji",
]);

/** Familias tipográficas declaradas en el CSS, por frecuencia. */
export function extractFonts(css: string, limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    for (const raw of match[1].split(",")) {
      const name = raw.replace(/["']|!important/g, "").trim();
      if (!name || name.startsWith("var(") || GENERIC_FONTS.has(name.toLowerCase())) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

const KEY_PAGE_RE = /(about|nosotros|quienes|sobre|servicio|service|product|producto|shop|tienda|pricing|precio|menu|catalog)/i;

/** Elige páginas internas útiles (about, productos, servicios...). */
export function pickKeyPages(links: string[], origin: string, limit = 4): string[] {
  return links
    .filter((l) => {
      try {
        const u = new URL(l);
        return u.origin === origin && KEY_PAGE_RE.test(u.pathname) && !/\.(pdf|jpg|png|zip)$/i.test(u.pathname);
      } catch {
        return false;
      }
    })
    .map((l) => l.split("#")[0])
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .slice(0, limit);
}
