import "server-only";
import { generateStructured } from "@/lib/ai/claude";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { IdeaPlanSchema, normalizeScript, ReelScriptSchema, type IdeaPlan, type ReelScript } from "./schema";

function brandContext(kit: BrandKit): string {
  return ["<brand_kit>", JSON.stringify(kit, null, 2), "</brand_kit>"].join("\n");
}

const IDEAS_SYSTEM = `Eres estratega de contenido de Instagram Reels.
Con el Brand Kit de una marca, planificas ideas de reels cortos (15-40 s) que generen alcance y conversiones.

- Reparte las ideas de forma equilibrada entre los pilares de contenido y varía los formatos.
- Cada hook debe frenar el scroll en los primeros 3 segundos: concreto, específico y sin clickbait vacío.
- Respeta la voz de la marca, sus palabras prohibidas y su idioma.
- Habla solo de productos y afirmaciones que aparezcan en el Brand Kit.
- No repitas ideas que ya existen.`;

export async function generateIdeaPlan(opts: {
  kit: BrandKit;
  count: number;
  existingTitles: string[];
}): Promise<IdeaPlan["ideas"]> {
  const plan = await generateStructured({
    schema: IdeaPlanSchema,
    system: IDEAS_SYSTEM,
    user: [
      brandContext(opts.kit),
      opts.existingTitles.length
        ? `<ideas_existentes>\n${opts.existingTitles.map((t) => `- ${t}`).join("\n")}\n</ideas_existentes>`
        : "",
      `Propón ${opts.count} ideas de reels para el próximo mes.`,
    ].join("\n\n"),
  });
  return plan.ideas.slice(0, opts.count);
}

const SCRIPT_SYSTEM = `Eres guionista de Instagram Reels verticales.
Escribes guiones por escenas que se convertirán automáticamente en video con clips de stock, texto en pantalla y voz en off.

- Duración total entre 15 y 40 segundos, de 3 a 7 escenas de 2 a 7 segundos.
- La primera escena es el hook: dura 2-3 segundos y el texto en pantalla debe funcionar sin sonido.
- La voz en off de cada escena debe poder leerse con calma en su duración (unas 2,5 palabras por segundo).
- El texto en pantalla es corto (máximo 8 palabras) y complementa la voz, no la repite entera.
- broll_query va en inglés, describe una imagen concreta y filmable (p. ej. "barista pouring latte"), sin marcas ni personas famosas.
- La última escena incluye la llamada a la acción.
- Caption: 2-4 frases con la voz de la marca, sin hashtags (van aparte). Entre 5 y 12 hashtags relevantes.
- Respeta la voz, el idioma y las palabras prohibidas del Brand Kit; no inventes datos ni promesas.`;

export async function generateReelScript(opts: {
  kit: BrandKit;
  idea: { title: string; hook: string | null; format: string | null; pillar: string | null };
  previous?: { script: ReelScript; feedback: string };
}): Promise<ReelScript> {
  const parts = [
    brandContext(opts.kit),
    `<idea>\n${JSON.stringify(opts.idea, null, 2)}\n</idea>`,
  ];
  if (opts.previous) {
    parts.push(
      `<guion_anterior>\n${JSON.stringify(opts.previous.script, null, 2)}\n</guion_anterior>`,
      `<cambios_solicitados>\n${opts.previous.feedback}\n</cambios_solicitados>`,
      "Reescribe el guion aplicando los cambios solicitados. Mantén lo que no se pidió cambiar.",
    );
  } else {
    parts.push("Escribe el guion de este reel.");
  }
  const script = await generateStructured({ schema: ReelScriptSchema, system: SCRIPT_SYSTEM, user: parts.join("\n\n") });
  return normalizeScript(script);
}
