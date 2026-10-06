import { describe, expect, it } from "vitest";
import { buildFullCaption, MAX_REEL_SECONDS, MAX_SCENES, normalizeScript, type ReelScript } from "@/lib/reels/schema";

const scene = (duration_seconds: number, text = "Texto") => ({
  duration_seconds,
  voiceover: `Voz ${text}`,
  on_screen_text: ` ${text} `,
  broll_query: "coffee beans",
});

const base: ReelScript = {
  title: "Agua y café",
  hook: "¿Tu café sabe amargo?",
  scenes: [scene(1), scene(4), scene(20)],
  caption: "  El secreto está en el agua.  ",
  hashtags: ["cafe", "#cafe", "##barista", "café de especialidad"],
  cta: "Comenta CAFÉ",
};

describe("normalizeScript", () => {
  it("ajusta duraciones y limpia textos", () => {
    const s = normalizeScript(base);
    expect(s.scenes.map((x) => x.duration_seconds)).toEqual([2, 4, 7]);
    expect(s.scenes[0].on_screen_text).toBe("Texto");
    expect(s.caption).toBe("El secreto está en el agua.");
    expect(s.hashtags).toEqual(["#cafe", "#barista", "#cafédeespecialidad"]);
  });

  it("limita el número de escenas y la duración total", () => {
    const s = normalizeScript({ ...base, scenes: Array.from({ length: 12 }, () => scene(7)) });
    expect(s.scenes).toHaveLength(MAX_SCENES);
    expect(s.scenes.reduce((sum, x) => sum + x.duration_seconds, 0)).toBeLessThanOrEqual(MAX_REEL_SECONDS);
  });

  it("descarta escenas vacías y falla si no queda ninguna", () => {
    const empty = { duration_seconds: 3, voiceover: " ", on_screen_text: "", broll_query: "" };
    expect(normalizeScript({ ...base, scenes: [empty, scene(3)] }).scenes).toHaveLength(1);
    expect(() => normalizeScript({ ...base, scenes: [empty] })).toThrow();
  });
});

describe("buildFullCaption", () => {
  it("une caption, CTA y hashtags y respeta 2200 caracteres", () => {
    expect(buildFullCaption({ caption: "Hola", cta: "Comenta", hashtags: ["#a", "#b"] })).toBe("Hola\n\nComenta\n\n#a #b");
    expect(buildFullCaption({ caption: "x".repeat(3000), cta: "", hashtags: [] })).toHaveLength(2200);
  });
});
