"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { discardIdeaAction, planIdeasAction, produceIdeasAction, type ActionResult } from "./actions";

export type IdeaRow = {
  id: string;
  title: string;
  hook: string | null;
  format: string | null;
  planned_for: string | null;
  status: "planned" | "in_production" | "discarded";
  pillar: string | null;
};

export function IdeasBoard({ ideas, remaining, hasBrandKit }: { ideas: IdeaRow[]; remaining: number; hasBrandKit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(12);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const planned = ideas.filter((i) => i.status === "planned");
  const inProduction = ideas.filter((i) => i.status === "in_production");

  const run = (fn: () => Promise<ActionResult>, after?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="font-semibold">Plan de contenido</h2>
          <p className="text-sm text-muted">Claude propone ideas a partir de tus pilares de contenido. Tardará en torno a un minuto.</p>
        </div>
        <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {[4, 8, 12, 20, 30].map((n) => (
            <option key={n} value={n}>
              {n} ideas
            </option>
          ))}
        </select>
        <Button disabled={pending || !hasBrandKit} onClick={() => run(() => planIdeasAction(count))}>
          {pending ? "Trabajando…" : "Generar ideas"}
        </Button>
      </Card>
      {!hasBrandKit && (
        <p className="text-sm text-muted">
          Necesitas un Brand Kit. <a href="/dashboard" className="text-accent hover:underline">Audita tu marca</a> primero.
        </p>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ideas planificadas ({planned.length})</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Te quedan {remaining} reels este mes</span>
            <button type="button" className="text-accent" onClick={() => setSelected(new Set(planned.map((i) => i.id)))}>
              Seleccionar todas
            </button>
            <Button
              disabled={pending || selected.size === 0}
              onClick={() => run(() => produceIdeasAction([...selected]), () => setSelected(new Set()))}
            >
              Producir {selected.size || ""} reels
            </Button>
          </div>
        </div>
        {planned.length === 0 && <p className="text-sm text-muted">No hay ideas pendientes.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {planned.map((idea) => (
            <li key={idea.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={selected.has(idea.id)} onChange={() => toggle(idea.id)} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{idea.title}</p>
                {idea.hook && <p className="text-sm text-muted">“{idea.hook}”</p>}
                <p className="mt-2 text-xs text-muted">
                  {[idea.planned_for, idea.format?.replaceAll("_", " "), idea.pillar].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button type="button" disabled={pending} className="self-start text-xs text-muted hover:text-red-600" onClick={() => run(() => discardIdeaAction(idea.id))}>
                Descartar
              </button>
            </li>
          ))}
        </ul>
      </section>

      {inProduction.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">En producción ({inProduction.length})</h2>
          <p className="text-sm text-muted">
            Sigue su estado en <a href="/reels" className="text-accent hover:underline">Reels</a>.
          </p>
        </section>
      )}
    </div>
  );
}
