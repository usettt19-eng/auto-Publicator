import { z } from "zod";

// Se mantiene sin restricciones de longitud/regex para que sea compatible con
// structured outputs; la normalización se hace en `normalizeBrandKit`.
export const BrandKitSchema = z.object({
  brand_name: z.string(),
  one_liner: z.string().describe("Qué hace la marca, en una frase"),
  niche: z.string(),
  value_proposition: z.string(),
  target_audience: z.object({
    description: z.string(),
    pain_points: z.array(z.string()),
    desires: z.array(z.string()),
  }),
  voice: z.object({
    tone: z.array(z.string()).describe("3-5 adjetivos, p. ej. cercano, experto, divertido"),
    description: z.string(),
    do: z.array(z.string()),
    dont: z.array(z.string()),
    sample_phrases: z.array(z.string()),
  }),
  language: z.string().describe("Idioma principal del contenido, código ISO 639-1"),
  products: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      url: z.string().nullable(),
    }),
  ),
  visual_identity: z.object({
    primary_colors: z.array(z.string()).describe("Hex #rrggbb"),
    secondary_colors: z.array(z.string()).describe("Hex #rrggbb"),
    fonts: z.array(z.string()),
    logo_url: z.string().nullable(),
    style_notes: z.string(),
  }),
  content_pillars: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      example_topics: z.array(z.string()),
    }),
  ),
  preferred_ctas: z.array(z.string()),
  banned_words: z.array(z.string()),
  hashtags: z.array(z.string()),
  instagram_insights: z.string().describe("Qué funciona en su Instagram actual; vacío si no hay datos"),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(value: string): string | null {
  const match = value.trim().match(HEX_RE);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}

const dedupe = (items: string[]) => [...new Set(items.map((i) => i.trim()).filter(Boolean))];

/** Limpia la salida del modelo o del formulario: colores válidos, sin duplicados, hashtags con #. */
export function normalizeBrandKit(kit: BrandKit): BrandKit {
  const colors = (list: string[]) =>
    dedupe(list.map(normalizeHex).filter((c): c is string => c !== null));
  return {
    ...kit,
    visual_identity: {
      ...kit.visual_identity,
      primary_colors: colors(kit.visual_identity.primary_colors).slice(0, 4),
      secondary_colors: colors(kit.visual_identity.secondary_colors).slice(0, 6),
      fonts: dedupe(kit.visual_identity.fonts),
    },
    voice: { ...kit.voice, tone: dedupe(kit.voice.tone) },
    content_pillars: kit.content_pillars.slice(0, 6),
    preferred_ctas: dedupe(kit.preferred_ctas),
    banned_words: dedupe(kit.banned_words),
    hashtags: dedupe(kit.hashtags.map((h) => `#${h.trim().replace(/^#+/, "").replace(/\s+/g, "")}`)).filter(
      (h) => h.length > 1,
    ),
  };
}

/** Valida y normaliza un Brand Kit procedente de JSON (p. ej. del editor). */
export function parseBrandKit(input: unknown): BrandKit {
  return normalizeBrandKit(BrandKitSchema.parse(input));
}
