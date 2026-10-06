"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { deleteRule, saveRule, setReplyMode, type RuleInput, type RuleResult } from "./actions";

export type RuleRow = {
  id: string;
  keyword: string;
  comment_reply: string | null;
  dm_message: string;
  link_url: string | null;
  match_in: "comments" | "dms" | "both";
  active: boolean;
  times_triggered: number;
};

const EMPTY: RuleInput = {
  keyword: "",
  comment_reply: "¡Hecho, {usuario}! Te lo envío por DM 📩",
  dm_message: "¡Hola! Aquí tienes lo prometido 👇\n{link}",
  link_url: "",
  match_in: "both",
  active: true,
};

const MODES = [
  { value: "off", label: "Desactivadas", hint: "Solo se aplican las reglas de palabra clave." },
  { value: "approval", label: "Con aprobación", hint: "Claude propone una respuesta y tú la apruebas en la bandeja." },
  { value: "auto", label: "Automáticas", hint: "Claude responde directamente con la voz de tu marca." },
] as const;

const CHANNEL_LABEL = { comments: "Comentarios", dms: "DMs", both: "Comentarios y DMs" };

function RuleForm({ initial, onDone }: { initial: RuleInput; onDone: () => void }) {
  const [rule, setRule] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof RuleInput>(key: K, value: RuleInput[K]) => setRule((r) => ({ ...r, [key]: value }));

  return (
    <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Palabra clave</span>
        <input className={inputClass} value={rule.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="GROW" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Dónde</span>
        <select className={inputClass} value={rule.match_in} onChange={(e) => set("match_in", e.target.value as RuleInput["match_in"])}>
          {Object.entries(CHANNEL_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Respuesta pública al comentario (opcional)</span>
        <input className={inputClass} value={rule.comment_reply ?? ""} onChange={(e) => set("comment_reply", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Mensaje del DM</span>
        <textarea className={`${inputClass} min-h-20`} value={rule.dm_message} onChange={(e) => set("dm_message", e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Enlace</span>
        <input className={inputClass} value={rule.link_url ?? ""} onChange={(e) => set("link_url", e.target.value)} placeholder="https://tumarca.com/guia" />
        <span className="text-xs text-muted">Usa {"{usuario}"} y {"{link}"} en los mensajes. Si el DM no incluye {"{link}"}, el enlace se añade al final.</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result: RuleResult = await saveRule(rule);
              if (result.ok) onDone();
              else setError(result.error);
            })
          }
        >
          Guardar regla
        </Button>
        <button type="button" className="text-sm text-muted" onClick={onDone}>
          Cancelar
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export function AutomationsPanel({ rules, mode }: { rules: RuleRow[]; mode: "off" | "approval" | "auto" }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  const run = (fn: () => Promise<RuleResult>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) router.refresh();
      else setError(result.error);
    });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-1 font-semibold">Palabras clave</h2>
        <p className="mb-4 text-sm text-muted">
          Cuando alguien comenta (o te escribe) la palabra clave, respondemos al comentario y le enviamos un DM con el enlace.
        </p>
        <div className="flex flex-col gap-3">
          {rules.map((r) =>
            editing === r.id ? (
              <RuleForm key={r.id} initial={{ ...r, link_url: r.link_url ?? "" }} onDone={done} />
            ) : (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
                <code className="rounded bg-background px-2 py-1 font-semibold">{r.keyword}</code>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate">{r.dm_message}</p>
                  <p className="text-xs text-muted">
                    {CHANNEL_LABEL[r.match_in]} · {r.times_triggered} {r.times_triggered === 1 ? "vez" : "veces"}
                  </p>
                </div>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={r.active} disabled={pending} onChange={(e) => run(() => saveRule({ ...r, link_url: r.link_url ?? "", active: e.target.checked }))} />
                  Activa
                </label>
                <button type="button" className="text-sm text-accent" onClick={() => setEditing(r.id)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="text-sm text-red-600"
                  disabled={pending}
                  onClick={() => confirm(`¿Eliminar la regla ${r.keyword}?`) && run(() => deleteRule(r.id))}
                >
                  Eliminar
                </button>
              </div>
            ),
          )}
          {editing === "new" ? (
            <RuleForm initial={EMPTY} onDone={done} />
          ) : (
            <button type="button" className="self-start text-sm text-accent" onClick={() => setEditing("new")}>
              + Nueva regla
            </button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Respuestas con IA al resto de comentarios</h2>
        <p className="mb-4 text-sm text-muted">Claude ignora el spam y los comentarios tóxicos, y nunca inventa precios ni promesas.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={pending}
              onClick={() => run(() => setReplyMode(m.value))}
              className={`rounded-xl border p-3 text-left text-sm ${mode === m.value ? "border-accent bg-background" : "border-border"}`}
            >
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted">{m.hint}</p>
            </button>
          ))}
        </div>
      </Card>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
