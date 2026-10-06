import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Operaciones que exponen las herramientas. Se inyectan para poder probarlas sin BD. */
export type McpServices = {
  getBrandKit(): Promise<unknown>;
  listIdeas(status?: "planned" | "in_production"): Promise<unknown>;
  generateIdeas(count: number): Promise<unknown>;
  createReels(ideaIds: string[]): Promise<unknown>;
  listReels(filter?: ReelFilter): Promise<unknown>;
  approveReel(reelId: string, scheduledAt?: string): Promise<unknown>;
  requestChanges(reelId: string, feedback: string): Promise<unknown>;
  rejectReel(reelId: string, reason?: string): Promise<unknown>;
  scheduleReel(reelId: string, scheduledAt: string): Promise<unknown>;
  getAnalytics(days: 7 | 30): Promise<unknown>;
  setKeywordRule(rule: KeywordRuleInput): Promise<unknown>;
  listPendingComments(): Promise<unknown>;
  replyToComment(commentId: string, text: string): Promise<unknown>;
};

export const REEL_FILTERS = ["pending_approval", "in_production", "scheduled", "published", "failed"] as const;
export type ReelFilter = (typeof REEL_FILTERS)[number];
export type KeywordRuleInput = {
  keyword: string;
  dm_message: string;
  link_url?: string;
  comment_reply?: string;
  match_in?: "comments" | "dms" | "both";
  active?: boolean;
};

const isoDate = z.iso.datetime({ offset: true }).describe("Fecha y hora ISO 8601 con zona, p. ej. 2026-10-20T18:00:00+02:00");

/** Servidor MCP de Auto-Publicator para un workspace autenticado. */
export function createMcpServer(services: McpServices) {
  const server = new McpServer(
    { name: "auto-publicator", version: "1.0.0" },
    {
      instructions:
        "Herramientas para gestionar reels de Instagram de una marca: Brand Kit, ideas, producción, aprobación y programación, analíticas y respuestas a comentarios. Nada se publica sin aprobación: usa approve_reel solo cuando la persona lo pida explícitamente.",
    },
  );

  const run = async (fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      return { content: [{ type: "text" as const, text: JSON.stringify(result ?? { ok: true }, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : "Error inesperado" }] };
    }
  };
  const read = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "get_brand_kit",
    { title: "Brand Kit", description: "Devuelve el Brand Kit: voz, público, productos, colores y pilares de contenido.", annotations: read },
    () => run(() => services.getBrandKit()),
  );

  server.registerTool(
    "list_ideas",
    {
      title: "Listar ideas",
      description: "Ideas de reels planificadas o en producción.",
      inputSchema: { status: z.enum(["planned", "in_production"]).optional() },
      annotations: read,
    },
    ({ status }) => run(() => services.listIdeas(status)),
  );

  server.registerTool(
    "generate_reel_ideas",
    {
      title: "Generar ideas",
      description: "Pide a Claude nuevas ideas de reels a partir del Brand Kit y las añade al plan. Puede tardar un minuto.",
      inputSchema: { count: z.number().int().min(1).max(20).default(8) },
    },
    ({ count }) => run(() => services.generateIdeas(count)),
  );

  server.registerTool(
    "create_reels",
    {
      title: "Producir reels",
      description: "Pasa ideas a producción: se generan guion y video. Consume cuota mensual del plan.",
      inputSchema: { idea_ids: z.array(z.string().uuid()).min(1).max(20) },
    },
    ({ idea_ids }) => run(() => services.createReels(idea_ids)),
  );

  server.registerTool(
    "list_reels",
    {
      title: "Listar reels",
      description: "Reels por estado: pending_approval (listos para revisar), in_production, scheduled, published o failed.",
      inputSchema: { status: z.enum(REEL_FILTERS).optional() },
      annotations: read,
    },
    ({ status }) => run(() => services.listReels(status)),
  );

  server.registerTool(
    "approve_reel",
    {
      title: "Aprobar reel",
      description: "Aprueba un reel listo y lo programa. Sin fecha, usa el siguiente hueco libre. Úsalo solo si la persona lo pide.",
      inputSchema: { reel_id: z.string().uuid(), scheduled_at: isoDate.optional() },
    },
    ({ reel_id, scheduled_at }) => run(() => services.approveReel(reel_id, scheduled_at)),
  );

  server.registerTool(
    "request_changes",
    {
      title: "Pedir cambios",
      description: "Pide cambios en un reel: Claude reescribe el guion según el feedback y se vuelve a renderizar.",
      inputSchema: { reel_id: z.string().uuid(), feedback: z.string().min(3).max(2000) },
    },
    ({ reel_id, feedback }) => run(() => services.requestChanges(reel_id, feedback)),
  );

  server.registerTool(
    "reject_reel",
    {
      title: "Rechazar reel",
      description: "Rechaza un reel: no se publicará.",
      inputSchema: { reel_id: z.string().uuid(), reason: z.string().max(500).optional() },
      annotations: { destructiveHint: true },
    },
    ({ reel_id, reason }) => run(() => services.rejectReel(reel_id, reason)),
  );

  server.registerTool(
    "schedule_reel",
    {
      title: "Reprogramar reel",
      description: "Cambia la fecha de publicación de un reel listo o aprobado.",
      inputSchema: { reel_id: z.string().uuid(), scheduled_at: isoDate },
    },
    ({ reel_id, scheduled_at }) => run(() => services.scheduleReel(reel_id, scheduled_at)),
  );

  server.registerTool(
    "get_analytics",
    {
      title: "Analíticas",
      description: "Rendimiento de los reels publicados: totales, engagement, mejores y peores, por pilar y formato.",
      inputSchema: { days: z.union([z.literal(7), z.literal(30)]).default(30) },
      annotations: read,
    },
    ({ days }) => run(() => services.getAnalytics(days)),
  );

  server.registerTool(
    "set_keyword_rule",
    {
      title: "Regla de palabra clave",
      description: "Crea o actualiza (por palabra clave) una regla: quien comente la palabra recibe un DM con el enlace.",
      inputSchema: {
        keyword: z.string().min(1).max(60),
        dm_message: z.string().min(1).max(1000).describe("Admite {usuario} y {link}"),
        link_url: z.url().optional(),
        comment_reply: z.string().max(300).optional(),
        match_in: z.enum(["comments", "dms", "both"]).optional(),
        active: z.boolean().optional(),
      },
    },
    (rule) => run(() => services.setKeywordRule(rule)),
  );

  server.registerTool(
    "list_pending_comments",
    { title: "Comentarios por aprobar", description: "Comentarios con una respuesta sugerida pendiente de aprobación.", annotations: read },
    () => run(() => services.listPendingComments()),
  );

  server.registerTool(
    "reply_to_comment",
    {
      title: "Responder comentario",
      description: "Publica la respuesta a un comentario pendiente (puede ser la sugerida o un texto nuevo).",
      inputSchema: { comment_id: z.string().uuid(), text: z.string().min(1).max(2200) },
    },
    ({ comment_id, text }) => run(() => services.replyToComment(comment_id, text)),
  );

  return server;
}
