import "server-only";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { getAccessToken } from "@/lib/instagram/accounts";
import { replyToComment, sendInstagramMessage } from "@/lib/instagram/api";
import { enqueueJob } from "@/lib/reels/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDmText, decideCommentAction, matchKeywordRule, renderTemplate, type KeywordRule } from "./keywords";
import { generateCommentReply } from "./reply";
import { parseInstagramWebhook } from "./webhook";

const RULE_COLUMNS = "id, keyword, comment_reply, dm_message, link_url, active, match_in";

// ---------------------------------------------------------------------------
// Entrada: webhook → filas + trabajos
// ---------------------------------------------------------------------------

/** Guarda comentarios y DMs nuevos y encola su procesamiento. Idempotente ante reenvíos de Meta. */
export async function ingestInstagramWebhook(payload: unknown) {
  const admin = createAdminClient();
  const { comments, messages } = parseInstagramWebhook(payload);
  const igIds = [...new Set([...comments, ...messages].map((e) => e.accountIgId))];
  if (igIds.length === 0) return { comments: 0, messages: 0 };

  const { data: accounts, error: accountsError } = await admin
    .from("instagram_accounts")
    .select("id, workspace_id, ig_user_id")
    .in("ig_user_id", igIds);
  // Si la BD falla hay que lanzar: el webhook responde 500 y Meta reintenta en vez de perder el evento.
  if (accountsError) throw accountsError;
  const accountByIg = new Map((accounts ?? []).map((a) => [a.ig_user_id as string, a]));
  let newComments = 0;
  let newMessages = 0;

  for (const event of comments) {
    const account = accountByIg.get(event.accountIgId);
    if (!account) continue;
    const { data: reel, error: reelError } = event.mediaId
      ? await admin.from("reels").select("id").eq("workspace_id", account.workspace_id).eq("ig_media_id", event.mediaId).maybeSingle()
      : { data: null, error: null };
    if (reelError) throw reelError;
    const { data: inserted, error } = await admin
      .from("comments")
      .upsert(
        {
          workspace_id: account.workspace_id,
          instagram_account_id: account.id,
          reel_id: reel?.id ?? null,
          ig_comment_id: event.commentId,
          ig_media_id: event.mediaId,
          ig_parent_id: event.parentId,
          from_ig_id: event.fromId,
          ig_username: event.fromUsername,
          text: event.text,
        },
        { onConflict: "ig_comment_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    for (const row of inserted ?? []) {
      await enqueueJob(account.workspace_id, "handle_comment", { commentId: row.id });
      newComments++;
    }
  }

  for (const event of messages) {
    const account = accountByIg.get(event.accountIgId);
    if (!account) continue;
    const { data: inserted, error } = await admin
      .from("dms")
      .upsert(
        {
          workspace_id: account.workspace_id,
          instagram_account_id: account.id,
          ig_message_id: event.messageId,
          ig_user_id: event.senderId,
          ig_thread_id: event.senderId,
          direction: event.isEcho ? "outbound" : "inbound",
          text: event.text,
          created_at: new Date(event.timestamp).toISOString(),
        },
        { onConflict: "ig_message_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    for (const row of inserted ?? []) {
      if (!event.isEcho) {
        await enqueueJob(account.workspace_id, "handle_dm", { dmId: row.id });
        newMessages++;
      }
    }
  }
  return { comments: newComments, messages: newMessages };
}

// ---------------------------------------------------------------------------
// Procesamiento de un comentario
// ---------------------------------------------------------------------------

type CommentRow = {
  id: string;
  workspace_id: string;
  instagram_account_id: string | null;
  reel_id: string | null;
  ig_comment_id: string;
  ig_username: string | null;
  from_ig_id: string | null;
  text: string;
  reply_status: string;
  reply_text: string | null;
  replied_at: string | null;
  dm_sent: boolean;
};

async function loadAccount(id: string | null) {
  if (!id) throw new Error("Comentario sin cuenta de Instagram");
  const admin = createAdminClient();
  const { data, error } = await admin.from("instagram_accounts").select("id, ig_user_id").eq("id", id).single();
  if (error) throw error;
  return { igUserId: data.ig_user_id as string, token: await getAccessToken(data.id) };
}

async function updateComment(id: string, fields: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin.from("comments").update(fields).eq("id", id);
  if (error) throw error;
}

async function recordOutboundDm(comment: CommentRow, text: string, messageId: string | null) {
  const admin = createAdminClient();
  await admin.from("dms").insert({
    workspace_id: comment.workspace_id,
    instagram_account_id: comment.instagram_account_id,
    ig_message_id: messageId,
    ig_user_id: comment.from_ig_id ?? "desconocido",
    ig_thread_id: comment.from_ig_id,
    ig_username: comment.ig_username,
    direction: "outbound",
    text,
    source_comment_id: comment.id,
  });
}

export async function handleComment(commentId: string) {
  const admin = createAdminClient();
  const { data: comment, error } = await admin
    .from("comments")
    .select("id, workspace_id, instagram_account_id, reel_id, ig_comment_id, ig_username, from_ig_id, text, reply_status, reply_text, replied_at, dm_sent")
    .eq("id", commentId)
    .single<CommentRow>();
  if (error) throw error;
  // "sending" significa que un intento anterior se quedó a medias: se continúa por donde iba.
  if (!["none", "sending"].includes(comment.reply_status)) return;

  const [wsRes, rulesRes, accountRes] = await Promise.all([
    admin.from("workspaces").select("comment_reply_mode").eq("id", comment.workspace_id).single(),
    admin.from("keyword_rules").select(RULE_COLUMNS).eq("workspace_id", comment.workspace_id),
    admin.from("instagram_accounts").select("ig_user_id").eq("id", comment.instagram_account_id ?? "").maybeSingle(),
  ]);
  // Sin reglas por un fallo de BD, una palabra clave acabaría respondida por la IA: mejor reintentar.
  const dbError = wsRes.error ?? rulesRes.error ?? accountRes.error;
  if (dbError) throw dbError;
  const [ws, rules, account] = [wsRes.data, rulesRes.data, accountRes.data];

  const decision = decideCommentAction({
    text: comment.text,
    fromSelf: Boolean(account && comment.from_ig_id === account.ig_user_id),
    rules: (rules ?? []) as KeywordRule[],
    mode: (ws?.comment_reply_mode ?? "approval") as "off" | "approval" | "auto",
  });

  if (decision.type === "ignore") {
    await updateComment(comment.id, { reply_status: "skipped", category: decision.reason === "own_comment" ? "own" : null });
    return;
  }

  if (decision.type === "rule") {
    const { rule } = decision;
    await updateComment(comment.id, { reply_status: "sending", matched_rule_id: rule.id });
    const { igUserId, token } = await loadAccount(comment.instagram_account_id);

    // Cada paso se marca al completarse para no repetirlo si hay un reintento.
    if (rule.comment_reply && !comment.replied_at) {
      const text = renderTemplate(rule.comment_reply, { username: comment.ig_username, link: rule.link_url });
      await replyToComment(comment.ig_comment_id, text, token);
      await updateComment(comment.id, { reply_text: text, replied_at: new Date().toISOString() });
    }
    if (!comment.dm_sent) {
      const dmText = buildDmText(rule, comment.ig_username);
      const messageId = await sendInstagramMessage({ igUserId, accessToken: token, text: dmText, to: { commentId: comment.ig_comment_id } });
      await updateComment(comment.id, { dm_sent: true });
      await recordOutboundDm(comment, dmText, messageId);
    }
    await updateComment(comment.id, { reply_status: "sent", category: "keyword", error: null });
    await admin.rpc("bump_keyword_rule", { p_rule: rule.id });
    return;
  }

  // Respuesta generada por Claude.
  const [{ data: kitRow, error: kitError }, { data: reel }] = await Promise.all([
    admin.from("brand_kits").select("kit").eq("workspace_id", comment.workspace_id).maybeSingle(),
    comment.reel_id ? admin.from("reels").select("caption").eq("id", comment.reel_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (kitError) throw kitError;
  if (!kitRow) {
    await updateComment(comment.id, { reply_status: "skipped", error: "Sin Brand Kit" });
    return;
  }
  const suggestion = comment.reply_text
    ? { category: "other", should_reply: true, reply: comment.reply_text }
    : await generateCommentReply({
        kit: kitRow.kit as BrandKit,
        reelCaption: (reel as { caption: string | null } | null)?.caption ?? null,
        comment: { username: comment.ig_username, text: comment.text },
      });

  if (!suggestion.should_reply) {
    await updateComment(comment.id, { reply_status: "skipped", category: suggestion.category });
    return;
  }
  if (decision.mode === "approval") {
    await updateComment(comment.id, { reply_status: "pending_approval", reply_text: suggestion.reply, category: suggestion.category });
    return;
  }

  await updateComment(comment.id, { reply_status: "sending", reply_text: suggestion.reply, category: suggestion.category });
  const { token } = await loadAccount(comment.instagram_account_id);
  await replyToComment(comment.ig_comment_id, suggestion.reply, token);
  await updateComment(comment.id, { reply_status: "sent", replied_at: new Date().toISOString(), error: null });
}

// ---------------------------------------------------------------------------
// DMs entrantes
// ---------------------------------------------------------------------------

export async function handleDm(dmId: string) {
  const admin = createAdminClient();
  const { data: dm, error } = await admin
    .from("dms")
    .select("id, workspace_id, instagram_account_id, ig_user_id, text, direction")
    .eq("id", dmId)
    .single();
  if (error) throw error;
  if (dm.direction !== "inbound") return;

  const { data: rules, error: rulesError } = await admin.from("keyword_rules").select(RULE_COLUMNS).eq("workspace_id", dm.workspace_id);
  if (rulesError) throw rulesError;
  const rule = matchKeywordRule(dm.text, (rules ?? []) as KeywordRule[], "dms");
  if (!rule) return;

  // No repetir si ya respondimos a este mensaje (reintento del trabajo).
  const { data: already } = await admin.from("dms").select("id").eq("source_dm_id", dm.id).maybeSingle();
  if (already) return;

  const { data: account } = await admin.from("instagram_accounts").select("id, ig_user_id").eq("id", dm.instagram_account_id).single();
  if (!account) return;
  const token = await getAccessToken(account.id);
  const text = buildDmText(rule, null);
  const messageId = await sendInstagramMessage({ igUserId: account.ig_user_id, accessToken: token, text, to: { recipientId: dm.ig_user_id } });
  await admin.from("dms").insert({
    workspace_id: dm.workspace_id,
    instagram_account_id: account.id,
    ig_message_id: messageId,
    ig_user_id: dm.ig_user_id,
    ig_thread_id: dm.ig_user_id,
    direction: "outbound",
    text,
    source_dm_id: dm.id,
  });
  await admin.rpc("bump_keyword_rule", { p_rule: rule.id });
}

// ---------------------------------------------------------------------------
// Acciones desde la bandeja de entrada
// ---------------------------------------------------------------------------

export class InboxError extends Error {}

/** Envía (opcionalmente editada) una respuesta pendiente de aprobación o que falló. */
export async function sendCommentReply(opts: { workspaceId: string; commentId: string; text: string }) {
  const admin = createAdminClient();
  const text = opts.text.trim().slice(0, 2200);
  if (!text) throw new InboxError("La respuesta no puede estar vacía");

  // Reclamo atómico: dos clics o dos personas no envían la respuesta dos veces.
  const { data: claimed, error } = await admin
    .from("comments")
    .update({ reply_status: "sending", reply_text: text })
    .eq("id", opts.commentId)
    .eq("workspace_id", opts.workspaceId)
    .in("reply_status", ["pending_approval", "failed"])
    .select("id, ig_comment_id, instagram_account_id")
    .maybeSingle();
  if (error) throw error;
  if (!claimed) throw new InboxError("Este comentario ya se respondió o cambió de estado");

  try {
    const { token } = await loadAccount(claimed.instagram_account_id);
    await replyToComment(claimed.ig_comment_id, text, token);
    await updateComment(claimed.id, { reply_status: "sent", replied_at: new Date().toISOString(), error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al responder";
    await updateComment(claimed.id, { reply_status: "failed", error: message });
    throw new InboxError(`Instagram no aceptó la respuesta: ${message}`);
  }
}

export async function skipComment(opts: { workspaceId: string; commentId: string }) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("comments")
    .update({ reply_status: "skipped" })
    .eq("id", opts.commentId)
    .eq("workspace_id", opts.workspaceId)
    .in("reply_status", ["pending_approval", "failed"]);
  if (error) throw error;
}
