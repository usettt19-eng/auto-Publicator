import { z } from "zod";

export const REEL_FORMATS = ["tip", "producto", "testimonio", "detras_de_camaras", "mito_vs_realidad", "tutorial", "tendencia"] as const;

export const IdeaPlanSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      hook: z.string().describe("Frase de los primeros 3 segundos"),
      format: z.enum(REEL_FORMATS),
      pillar_name: z.string().describe("Nombre exacto de uno de los pilares de contenido"),
    }),
  ),
});
export type IdeaPlan = z.infer<typeof IdeaPlanSchema>;

export const ReelScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  scenes: z.array(
    z.object({
      duration_seconds: z.number().describe("Entre 2 y 7 segundos"),
      voiceover: z.string().describe("Texto que se locuta en esta escena"),
      on_screen_text: z.string().describe("Texto corto en pantalla, máximo 8 palabras"),
      broll_query: z.string().describe("Búsqueda en inglés para un clip vertical de stock, 2-4 palabras"),
    }),
  ),
  caption: z.string().describe("Caption de Instagram sin hashtags"),
  hashtags: z.array(z.string()),
  cta: z.string(),
});
export type ReelScript = z.infer<typeof ReelScriptSchema>;

export const MIN_SCENE_SECONDS = 2;
export const MAX_SCENE_SECONDS = 7;
export const MAX_SCENES = 8;
export const MAX_REEL_SECONDS = 60;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Ajusta el guion a los límites del render: escenas, duraciones, hashtags y caption. */
export function normalizeScript(script: ReelScript): ReelScript {
  const scenes = script.scenes
    .filter((s) => s.voiceover.trim() || s.on_screen_text.trim())
    .slice(0, MAX_SCENES)
    .map((s) => ({
      ...s,
      duration_seconds: clamp(Number.isFinite(s.duration_seconds) ? s.duration_seconds : 4, MIN_SCENE_SECONDS, MAX_SCENE_SECONDS),
      on_screen_text: s.on_screen_text.trim(),
      voiceover: s.voiceover.trim(),
      broll_query: s.broll_query.trim() || "abstract background",
    }));
  if (scenes.length === 0) throw new Error("El guion no tiene escenas");

  // Si se pasa del máximo, se escala proporcionalmente.
  const total = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);
  if (total > MAX_REEL_SECONDS) {
    const factor = MAX_REEL_SECONDS / total;
    for (const s of scenes) s.duration_seconds = Math.max(MIN_SCENE_SECONDS, Math.floor(s.duration_seconds * factor * 10) / 10);
  }

  const hashtags = [
    ...new Set(script.hashtags.map((h) => `#${h.trim().replace(/^#+/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 1)),
  ].slice(0, 15);

  return { ...script, scenes, hashtags, caption: script.caption.trim(), cta: script.cta.trim() };
}

/** Texto final que se publica en Instagram (límite de 2200 caracteres). */
export function buildFullCaption(script: Pick<ReelScript, "caption" | "cta" | "hashtags">): string {
  const parts = [script.caption, script.cta, script.hashtags.join(" ")].filter(Boolean);
  return parts.join("\n\n").slice(0, 2200);
}
