"use server";

import { revalidatePath } from "next/cache";
import { InboxError, sendCommentReply, skipComment } from "@/lib/engagement/process";
import { requireWorkspace } from "@/lib/workspace";

export type InboxResult = { ok: true } | { ok: false; error: string };

export async function sendReplyAction(commentId: string, text: string): Promise<InboxResult> {
  const { workspace } = await requireWorkspace();
  try {
    await sendCommentReply({ workspaceId: workspace.id, commentId, text });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (err) {
    if (err instanceof InboxError) return { ok: false, error: err.message };
    console.error("[inbox] send", err);
    return { ok: false, error: "No se pudo enviar la respuesta" };
  }
}

export async function skipCommentAction(commentId: string): Promise<InboxResult> {
  const { workspace } = await requireWorkspace();
  try {
    await skipComment({ workspaceId: workspace.id, commentId });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (err) {
    console.error("[inbox] skip", err);
    return { ok: false, error: "No se pudo descartar" };
  }
}
