"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { createApiKeyAction, revokeApiKeyAction } from "./api-keys-actions";

export type ApiKeyRow = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null };

export function ApiKeys({ keys, mcpUrl }: { keys: ApiKeyRow[]; mcpUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const config = JSON.stringify(
    { mcpServers: { "auto-publicator": { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${created ?? "ap_…"}` } } } },
    null,
    2,
  );

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Conector MCP</h2>
        <p className="text-sm text-muted">
          Usa Auto-Publicator desde Claude Code, Claude Desktop u otro cliente MCP: pide ideas, aprueba reels o consulta
          analíticas desde el chat. URL del servidor: <code className="text-foreground">{mcpUrl}</code>
        </p>
      </div>

      {created && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent p-4 text-sm">
          <p className="font-medium">Copia tu clave ahora: no se volverá a mostrar.</p>
          <code className="break-all rounded bg-background px-2 py-1">{created}</code>
          <p className="text-muted">Configuración para tu cliente MCP:</p>
          <pre className="overflow-x-auto rounded bg-background p-3 text-xs">{config}</pre>
          <p className="text-xs text-muted">
            En Claude Code: <code>claude mcp add --transport http auto-publicator {mcpUrl} --header &quot;Authorization: Bearer {created}&quot;</code>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={inputClass} placeholder="Nombre (p. ej. Claude Desktop)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          className="shrink-0"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await createApiKeyAction(name);
              if (result.ok) {
                setCreated(result.key);
                setName("");
                router.refresh();
              } else setError(result.error);
            })
          }
        >
          Crear clave
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {keys.length > 0 && (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-medium">{k.name}</span>
              <code className="text-muted">{k.key_prefix}…</code>
              <span className="text-xs text-muted">{k.last_used_at ? `Usada ${new Date(k.last_used_at).toLocaleString()}` : "Sin usar"}</span>
              <button
                type="button"
                disabled={pending}
                className="ml-auto text-red-600 hover:underline"
                onClick={() =>
                  confirm(`¿Revocar la clave "${k.name}"? Los clientes que la usen dejarán de funcionar.`) &&
                  startTransition(async () => {
                    await revokeApiKeyAction(k.id);
                    router.refresh();
                  })
                }
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
