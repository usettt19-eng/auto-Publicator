"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { generateReportAction, refreshAnalyticsAction, type AnalyticsResult } from "./actions";

export function AnalyticsActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<AnalyticsResult>) =>
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-card" onClick={() => run(refreshAnalyticsAction)}>
        Actualizar métricas
      </button>
      <Button disabled={pending} onClick={() => run(generateReportAction)}>
        {pending ? "Trabajando…" : "Generar resumen semanal"}
      </Button>
      {message && <span className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
    </div>
  );
}
