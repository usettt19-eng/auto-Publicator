import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { bearerKey, generateApiKey, hashApiKey } from "@/lib/mcp/keys";
import { createMcpServer, type McpServices } from "@/lib/mcp/server";

function fakeServices(): McpServices {
  return {
    getBrandKit: vi.fn(async () => ({ brand_name: "Café Luna" })),
    listIdeas: vi.fn(async () => []),
    generateIdeas: vi.fn(async (count: number) => ({ created: count })),
    createReels: vi.fn(async (ids: string[]) => ({ created: ids.length })),
    listReels: vi.fn(async () => []),
    approveReel: vi.fn(async () => ({ status: "approved" })),
    requestChanges: vi.fn(async () => ({ status: "changes_requested" })),
    rejectReel: vi.fn(async () => ({ status: "rejected" })),
    scheduleReel: vi.fn(async () => {
      throw new Error("La fecha de publicación debe ser al menos 5 minutos en el futuro");
    }),
    getAnalytics: vi.fn(async (days: number) => ({ period_days: days })),
    setKeywordRule: vi.fn(async () => ({ keyword: "GROW" })),
    listPendingComments: vi.fn(async () => []),
    replyToComment: vi.fn(async () => ({ ok: true })),
  };
}

async function connect(services: McpServices) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer(services).connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

const REEL = "11111111-1111-4111-8111-111111111111";

describe("servidor MCP", () => {
  it("expone las 13 herramientas", async () => {
    const client = await connect(fakeServices());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "approve_reel",
        "create_reels",
        "generate_reel_ideas",
        "get_analytics",
        "get_brand_kit",
        "list_ideas",
        "list_pending_comments",
        "list_reels",
        "reject_reel",
        "reply_to_comment",
        "request_changes",
        "schedule_reel",
        "set_keyword_rule",
      ].sort(),
    );
    expect(tools.find((t) => t.name === "get_brand_kit")?.annotations?.readOnlyHint).toBe(true);
  });

  it("llama al servicio con los argumentos validados y devuelve JSON", async () => {
    const services = fakeServices();
    const client = await connect(services);
    const result = await client.callTool({ name: "approve_reel", arguments: { reel_id: REEL, scheduled_at: "2026-10-20T18:00:00+02:00" } });
    expect(services.approveReel).toHaveBeenCalledWith(REEL, "2026-10-20T18:00:00+02:00");
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual({ status: "approved" });
  });

  it("aplica valores por defecto", async () => {
    const services = fakeServices();
    const client = await connect(services);
    await client.callTool({ name: "get_analytics", arguments: {} });
    expect(services.getAnalytics).toHaveBeenCalledWith(30);
  });

  it("rechaza argumentos inválidos sin llamar al servicio", async () => {
    const services = fakeServices();
    const client = await connect(services);
    const result = await client.callTool({ name: "approve_reel", arguments: { reel_id: "no-es-uuid" } });
    expect(result.isError).toBe(true);
    expect(services.approveReel).not.toHaveBeenCalled();
  });

  it("convierte los errores del servicio en isError con el mensaje", async () => {
    const client = await connect(fakeServices());
    const result = await client.callTool({ name: "schedule_reel", arguments: { reel_id: REEL, scheduled_at: "2026-10-06T10:00:00Z" } });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain("5 minutos");
  });
});

describe("claves de API", () => {
  it("genera claves con prefijo y guarda solo el hash", () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key.startsWith("ap_")).toBe(true);
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key);
    expect(key.startsWith(prefix)).toBe(true);
    expect(generateApiKey().key).not.toBe(key);
  });

  it("lee el Bearer solo si es una clave nuestra", () => {
    expect(bearerKey("Bearer ap_abc")).toBe("ap_abc");
    expect(bearerKey("bearer ap_abc")).toBe("ap_abc");
    expect(bearerKey("Bearer otro_token")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});
