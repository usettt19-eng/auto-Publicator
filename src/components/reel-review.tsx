"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, inputClass } from "@/components/ui";
import type { ReviewInput } from "@/lib/reels/review";
import { STATUS_LABEL, type ReelStatus } from "@/lib/reels/state";

export type ReviewableReel = {
  id: string;
  status: ReelStatus;
  title: string | null;
  caption: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  scheduled_at: string | null;
  error: string | null;
};

type Result = { ok: true } | { ok: false; error: string };

/** ISO → valor de <input type="datetime-local"> en la hora local del navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_STYLE: Partial<Record<ReelStatus, string>> = {
  ready: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-900",
  published: "bg-blue-100 text-blue-900",
  rejected: "bg-stone-200 text-stone-700",
  failed: "bg-red-100 text-red-900",
};

export function ReelReview({
  reel,
  action,
  mode,
}: {
  reel: ReviewableReel;
  action: (input: ReviewInput) => Promise<Result>;
  mode: "dashboard" | "email";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [caption, setCaption] = useState(reel.caption ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(reel.scheduled_at));
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const s = reel.status;
  const canEditCaption = s === "ready" || s === "approved";
  const run = (input: ReviewInput, successMessage: string) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await action(input);
      if (result.ok) {
        setDone(successMessage);
        setShowFeedback(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };
  const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row">
      <div className="w-full shrink-0 sm:w-56">
        {reel.video_url ? (
          <video
            src={reel.video_url}
            poster={reel.thumbnail_url ?? undefined}
            controls
            playsInline
            preload="none"
            className="aspect-[9/16] w-full rounded-xl bg-black object-cover"
          />
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-background text-center text-sm text-muted">
            {s === "failed" ? "Sin video" : "Generando…"}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s] ?? "bg-stone-100 text-stone-700"}`}>
            {STATUS_LABEL[s]}
          </span>
          {reel.scheduled_at && (s === "approved" || s === "published") && (
            <span className="text-xs text-muted">
              {s === "published" ? "Publicado" : "Se publica"} el {new Date(reel.scheduled_at).toLocaleString()}
            </span>
          )}
        </div>
        <h3 className="font-semibold">{reel.title ?? "Reel sin título"}</h3>
        {reel.error && <p className="text-sm text-red-600">{reel.error}</p>}

        {canEditCaption ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Caption</span>
            <textarea className={`${inputClass} min-h-32`} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
            {caption !== (reel.caption ?? "") && (
              <button
                type="button"
                disabled={pending}
                className="self-start text-sm text-accent hover:underline"
                onClick={() => run({ action: "edit_caption", caption }, "Caption guardado")}
              >
                Guardar caption
              </button>
            )}
          </label>
        ) : (
          reel.caption && <p className="line-clamp-4 whitespace-pre-line text-sm text-muted">{reel.caption}</p>
        )}

        {(s === "ready" || s === "approved") && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Fecha de publicación</span>
            <input type="datetime-local" className={`${inputClass} max-w-64`} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            {s === "ready" && !scheduledAt && <span className="text-xs text-muted">Si la dejas vacía, usamos el siguiente hueco libre.</span>}
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          {s === "ready" && (
            <Button disabled={pending} onClick={() => run({ action: "approve", scheduledAt: scheduledIso }, "Aprobado y programado")}>
              Aprobar y programar
            </Button>
          )}
          {s === "approved" && scheduledIso && scheduledIso !== reel.scheduled_at && (
            <Button disabled={pending} onClick={() => run({ action: "reschedule", scheduledAt: scheduledIso }, "Fecha actualizada")}>
              Guardar fecha
            </Button>
          )}
          {(s === "ready" || s === "approved" || s === "failed") && (
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-background"
              onClick={() => setShowFeedback((v) => !v)}
            >
              Pedir cambios
            </button>
          )}
          {mode === "dashboard" && s === "approved" && (
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-background"
              onClick={() => run({ action: "unapprove" }, "Aprobación retirada")}
            >
              Quitar aprobación
            </button>
          )}
          {mode === "dashboard" && s === "failed" && (
            <button
              type="button"
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-background"
              onClick={() => run({ action: "retry" }, "Reintentando")}
            >
              Reintentar
            </button>
          )}
          {(s === "ready" || s === "approved" || s === "failed") && (
            <button
              type="button"
              disabled={pending}
              className="px-2 py-2 text-sm text-red-600 hover:underline"
              onClick={() => {
                if (confirm("¿Rechazar este reel? No se publicará.")) run({ action: "reject" }, "Reel rechazado");
              }}
            >
              Rechazar
            </button>
          )}
        </div>

        {showFeedback && (
          <div className="flex flex-col gap-2">
            <textarea
              className={`${inputClass} min-h-24`}
              placeholder="Ej.: el hook es muy largo, usa un tono más divertido y termina invitando a comentar GROW"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <Button
              disabled={pending || !feedback.trim()}
              className="self-start"
              onClick={() => run({ action: "request_changes", note: feedback }, "Cambios enviados: generamos una nueva versión")}
            >
              Enviar cambios
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-green-700">{done}</p>}
      </div>
    </article>
  );
}
