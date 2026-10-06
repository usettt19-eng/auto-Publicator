import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NextRequest } from "next/server";
import { bearerKey } from "@/lib/mcp/keys";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateApiKey, createMcpServices } from "@/lib/mcp/services";

// generate_reel_ideas llama a Claude y puede tardar.
export const maxDuration = 300;

function unauthorized() {
  return new Response(JSON.stringify({ error: "Falta una clave de API válida (Authorization: Bearer ap_…)" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="auto-publicator"' },
  });
}

/** Servidor MCP sin estado: cada petición crea su servidor y transporte, autenticado por clave de API. */
async function handle(request: NextRequest) {
  const key = bearerKey(request.headers.get("authorization"));
  const ctx = key ? await authenticateApiKey(key) : null;
  if (!ctx) return unauthorized();

  const server = createMcpServer(createMcpServices(ctx));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
