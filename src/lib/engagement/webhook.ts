import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica la cabecera X-Hub-Signature-256 ("sha256=<hex>") con el secreto de la app. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type CommentEvent = {
  accountIgId: string;
  commentId: string;
  parentId: string | null;
  mediaId: string | null;
  fromId: string | null;
  fromUsername: string | null;
  text: string;
};

export type MessageEvent = {
  accountIgId: string;
  messageId: string;
  senderId: string;
  text: string;
  isEcho: boolean;
  timestamp: number;
};

type RawPayload = {
  object?: string;
  entry?: {
    id?: string;
    changes?: { field?: string; value?: Record<string, unknown> }[];
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean };
    }[];
  }[];
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Extrae comentarios y mensajes del payload de webhooks de Instagram; ignora lo demás. */
export function parseInstagramWebhook(payload: unknown): { comments: CommentEvent[]; messages: MessageEvent[] } {
  const body = payload as RawPayload;
  const comments: CommentEvent[] = [];
  const messages: MessageEvent[] = [];
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) return { comments, messages };

  for (const entry of body.entry) {
    const accountIgId = str(entry.id);
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const from = (v.from ?? {}) as Record<string, unknown>;
      const media = (v.media ?? {}) as Record<string, unknown>;
      const commentId = str(v.id);
      if ((change.field !== "comments" && change.field !== "live_comments") || !accountIgId || !commentId) continue;
      comments.push({
        accountIgId,
        commentId,
        parentId: str(v.parent_id),
        mediaId: str(media.id),
        fromId: str(from.id),
        fromUsername: str(from.username),
        text: typeof v.text === "string" ? v.text : "",
      });
    }
    for (const m of entry.messaging ?? []) {
      const message = m.message;
      const isEcho = Boolean(message?.is_echo);
      // En los ecos (mensajes que enviamos nosotros) la cuenta es el remitente.
      const account = str(isEcho ? m.sender?.id : m.recipient?.id) ?? accountIgId;
      const sender = str(isEcho ? m.recipient?.id : m.sender?.id);
      if (!message?.mid || message.is_deleted || !account || !sender) continue;
      messages.push({
        accountIgId: account,
        messageId: message.mid,
        senderId: sender,
        text: message.text ?? "",
        isEcho,
        timestamp: m.timestamp ?? Date.now(),
      });
    }
  }
  return { comments, messages };
}
