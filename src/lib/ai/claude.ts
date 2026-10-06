import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "@/lib/env";

export class ClaudeOutputError extends Error {}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

/**
 * Llamada a Claude con salida estructurada validada por Zod.
 * Activa el fallback del servidor: si el modelo rechaza la petición, la API reintenta con otro.
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  user: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model: env.anthropicModel(),
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  if (response.stop_reason === "refusal") {
    throw new ClaudeOutputError("El modelo rechazó la petición");
  }
  if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
    throw new ClaudeOutputError("La respuesta del modelo no tenía el formato esperado");
  }
  return response.parsed_output as z.infer<T>;
}
