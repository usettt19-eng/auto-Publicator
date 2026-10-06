import { describe, expect, it } from "vitest";
import { parseBrandKit, type BrandKit } from "@/lib/brand-kit/schema";

const base: BrandKit = {
  brand_name: "Café Luna",
  one_liner: "Café de especialidad",
  niche: "Café",
  value_proposition: "Tueste fresco",
  target_audience: { description: "Amantes del café", pain_points: [], desires: [] },
  voice: { tone: ["cercano", " cercano ", "experto"], description: "", do: [], dont: [], sample_phrases: [] },
  language: "es",
  products: [{ name: "Etiopía", description: "Floral", url: null }],
  visual_identity: {
    primary_colors: ["E07A5F", "#abc", "rojo", "#e07a5f"],
    secondary_colors: [],
    fonts: ["Inter", "Inter"],
    logo_url: null,
    style_notes: "",
  },
  content_pillars: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, description: "", example_topics: [] })),
  preferred_ctas: ["Comenta CAFÉ"],
  banned_words: [],
  hashtags: ["cafe", "##Specialty Coffee", "#"],
  instagram_insights: "",
};

describe("parseBrandKit", () => {
  it("normaliza colores, duplicados, hashtags y pilares", () => {
    const kit = parseBrandKit(base);
    expect(kit.visual_identity.primary_colors).toEqual(["#e07a5f", "#aabbcc"]);
    expect(kit.visual_identity.fonts).toEqual(["Inter"]);
    expect(kit.voice.tone).toEqual(["cercano", "experto"]);
    expect(kit.hashtags).toEqual(["#cafe", "#SpecialtyCoffee"]);
    expect(kit.content_pillars).toHaveLength(6);
  });

  it("rechaza objetos incompletos", () => {
    const withoutVoice: Partial<BrandKit> = { ...base };
    delete withoutVoice.voice;
    expect(() => parseBrandKit(withoutVoice)).toThrow();
  });
});
