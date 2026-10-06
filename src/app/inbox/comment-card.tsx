"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, inputClass } from "@/components/ui";
import { sendReplyAction, skipCommentAction } from "./actions";

export type CommentRow = {
  id: string;
  ig_username: string | null;
  text: string;
  reply_text: string | null;
  reply_status: string;
  category: string | null;
  error: string | null;
  dm_sent: boolean;
  created_at: string;
  reel_title: string | null;
};

const STATUS: Record<string, string> = {
  none: "Procesando",
  pending_approval: "Por aprobar",
  sending: "Enviando",
  sent: "Respondido",
  skipped: "Sin respuesta",
  failed: "Falló",
};

const CATEGORY: Record<string, string> = {
  question: "Pregunta",
  praise: "Elogio",
  feedback: "Sugerencia",
  complaint: "Queja",
  spam: "Spam",
  toxic: "Tóxico",
  keyword: "Palabra clave",
  own: "Tu cuenta",
  other: "Otro",
};

export function CommentCard({ comment }: { comment: CommentRow }) {
  const router = useRouter();
  const [text, setText] = useState(comment.reply_text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actionable = comment.reply_status === "pending_approval" || comment.reply_status === "failed";

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.ok) router.refresh();
      else setError(result.error);
    });

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-foreground">@{comment.ig_username ?? "usuario"}</span>
        <span>{new Date(comment.created_at).toLocaleString()}</span>
        {comment.reel_title && <span>· en “{comment.reel_title}”</span>}
        {comment.category && <span className="rounded-full bg-background px-2 py-0.5">{CATEGORY[comment.category] ?? comment.category}</span>}
        <span className="ml-auto">{STATUS[comment.reply_status] ?? comment.reply_status}</span>
      </div>
      <p className="text-sm">{comment.text}</p>
      {actionable ? (
        <>
          <textarea className={`${inputClass} min-h-16`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2200} />
          <div className="flex items-center gap-3">
            <Button disabled={pending || !text.trim()} onClick={() => run(() => sendReplyAction(comment.id, text))}>
              Responder
            </Button>
            <button type="button" disabled={pending} className="text-sm text-muted hover:text-foreground" onClick={() => run(() => skipCommentAction(comment.id))}>
              No responder
            </button>
          </div>
        </>
      ) : (
        comment.reply_text && (
          <p className="border-l-2 border-accent pl-3 text-sm text-muted">
            {comment.reply_text}
            {comment.dm_sent && " · DM enviado"}
          </p>
        )
      )}
      {(error || comment.error) && <p className="text-sm text-red-600">{error ?? comment.error}</p>}
    </article>
  );
}
