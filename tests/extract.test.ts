import { describe, expect, it } from "vitest";
import { extractColors, extractFonts, extractPage, pickKeyPages } from "@/lib/scraper/extract";

const html = `<!doctype html><html><head>
<title>Café Luna</title>
<meta name="description" content="Café de especialidad tostado en Madrid">
<meta name="theme-color" content="#2f6f4e">
<meta property="og:image" content="/og.jpg">
<link rel="stylesheet" href="/styles.css">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400&family=Inter" rel="stylesheet">
<style>.btn{background:#E07A5F;color:#fff}</style>
</head><body>
<img src="/clientes/logo-acme.png" alt="Acme logo">
<header><img src="/img/logo.svg" alt="Café Luna logo"></header>
<h1>Café que se nota</h1><h2>Nuestros orígenes</h2>
<script>window.secret = 1</script>
<a href="/nosotros">Nosotros</a><a href="/tienda#top">Tienda</a><a href="https://instagram.com/cafeluna">IG</a>
<a href="https://otro.com/about">Fuera</a>
</body></html>`;

describe("extractPage", () => {
  const page = extractPage(html, "https://cafeluna.es/");

  it("extrae metadatos y texto sin scripts", () => {
    expect(page.title).toBe("Café Luna");
    expect(page.description).toContain("especialidad");
    expect(page.headings).toEqual(["Café que se nota", "Nuestros orígenes"]);
    expect(page.text).not.toContain("secret");
    expect(page.themeColor).toBe("#2f6f4e");
  });

  it("resuelve URLs de logo, hojas de estilo y fuentes", () => {
    expect(page.logoCandidates[0]).toBe("https://cafeluna.es/img/logo.svg");
    expect(page.logoCandidates).toContain("https://cafeluna.es/og.jpg");
    expect(page.stylesheetUrls).toContain("https://cafeluna.es/styles.css");
    expect(page.fontFamilies).toEqual(["Playfair Display", "Inter"]);
    expect(page.socialLinks).toEqual(["https://instagram.com/cafeluna"]);
  });

  it("elige páginas clave del mismo dominio", () => {
    expect(pickKeyPages(page.links, "https://cafeluna.es")).toEqual([
      "https://cafeluna.es/nosotros",
      "https://cafeluna.es/tienda",
    ]);
  });
});

describe("extractColors / extractFonts", () => {
  it("ordena por frecuencia, expande hex cortos e ignora blanco/negro", () => {
    const css = "a{color:#e07a5f} b{color:#E07A5F} c{color:#abc} d{color:#fff;background:#000000}";
    expect(extractColors(css)).toEqual(["#e07a5f", "#aabbcc"]);
  });

  it("convierte rgb()/rgba() a hex", () => {
    expect(extractColors("a{color:rgb(224, 122, 95)} b{color:rgba(224 122 95 / .5)} c{color:rgb(0,0,0)}")).toEqual([
      "#e07a5f",
    ]);
  });

  it("ignora fuentes genéricas y variables", () => {
    const css = `body{font-family:"Playfair Display",serif} p{font-family:var(--f), Inter, Arial, sans-serif} h1{font-family:'Playfair Display'}`;
    expect(extractFonts(css)).toEqual(["Playfair Display", "Inter"]);
  });
});
