import "server-only";
import { computeStats } from "@/lib/analytics/stats";
import { loadPerformance } from "@/lib/analytics/service";
import { sendCommentReply } from "@/lib/engagement/process";
import { planIdeas, produceReels } from "@/lib/reels/production";
import { reviewReel } from "@/lib/reels/review";
import { IN_PROGRESS, type ReelStatus } from "@/lib/reels/state";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "./keys";
import type { McpServices, ReelFilter } from "./server";

export type McpContext = { workspaceId: string; userId: string; timezone: string };

/** Resuelve una clave de API a su workspace. Devuelve null si no existe o está revocada. */
export async function authenticateApiKey(key: string): Promise<McpContext | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("api_keys")
    .select("id, workspace_id, user_id, revoked_at, workspaces(timezone)")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  const ws = data.workspaces as unknown as { timezone: string } | null;
  return { workspaceId: data.workspace_id, userId: data.user_id, timezone: ws?.timezone ?? "UTC" };
}

const FILTER_STATUSES: Record<ReelFilter, ReelStatus[]> = {
  pending_approval: ["ready"],
  in_production: IN_PROGRESS,
  scheduled: ["approved", "publishing"],
  published: ["published"],
  failed: ["failed"],
};

export function createMcpServices(ctx: McpContext): McpServices {
  const admin = createAdminClient();
  const ws = ctx.workspaceId;
  const must = <T>(res: { data: T; error: unknown }) => {
    if (res.error) throw res.error;
    return res.data;
  };

  return {
    async getBrandKit() {
      const row = must(await admin.from("brand_kits").select("kit, updated_at").eq("workspace_id", ws).maybeSingle());
      if (!row) throw new Error("Aún no hay Brand Kit: audita la marca desde el panel.");
      return row.kit;
    },

    async listIdeas(status) {
      return must(
        await admin
          .from("reel_ideas")
          .select("id, title, hook, format, planned_for, status, content_pillars(name)")
          .eq("workspace_id", ws)
          .in("status", status ? [status] : ["planned", "in_production"])
          .order("planned_for", { ascending: true })
          .limit(100),
      );
    },

    async generateIdeas(count) {
      const created = await planIdeas({ id: ws, timezone: ctx.timezone }, count);
      return { created, next: "Usa list_ideas para verlas y create_reels para producirlas." };
    },

    async createReels(ideaIds) {
      const created = await produceReels(ws, ideaIds);
      return { created, next: "Los reels tardan unos minutos. Consulta list_reels con status in_production." };
    },

    async listReels(filter) {
      let query = admin
        .from("reels")
        .select("id, title, status, caption, video_url, scheduled_at, published_at, ig_permalink, error, reel_metrics(views, reach, total_interactions)")
        .eq("workspace_id", ws)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (filter) query = query.in("status", FILTER_STATUSES[filter]);
      return must(await query);
    },

    approveReel: (reelId, scheduledAt) =>
      reviewReel({ reelId, workspaceId: ws, actorId: ctx.userId, input: { action: "approve", scheduledAt: scheduledAt ?? null } }),
    requestChanges: (reelId, feedback) =>
      reviewReel({ reelId, workspaceId: ws, actorId: ctx.userId, input: { action: "request_changes", note: feedback } }),
    rejectReel: (reelId, reason) => reviewReel({ reelId, workspaceId: ws, actorId: ctx.userId, input: { action: "reject", note: reason } }),
    scheduleReel: (reelId, scheduledAt) =>
      reviewReel({ reelId, workspaceId: ws, actorId: ctx.userId, input: { action: "reschedule", scheduledAt } }),

    async getAnalytics(days) {
      const stats = computeStats(await loadPerformance(ws, days));
      return { period_days: days, ...stats };
    },

    async setKeywordRule(rule) {
      const row = {
        workspace_id: ws,
        keyword: rule.keyword.trim().toUpperCase(),
        dm_message: rule.dm_message,
        link_url: rule.link_url ?? null,
        comment_reply: rule.comment_reply ?? null,
        match_in: rule.match_in ?? "both",
        active: rule.active ?? true,
      };
      return must(await admin.from("keyword_rules").upsert(row, { onConflict: "workspace_id,keyword" }).select("id, keyword, active").single());
    },

    async listPendingComments() {
      return must(
        await admin
          .from("comments")
          .select("id, ig_username, text, reply_text, category, created_at, reels(title)")
          .eq("workspace_id", ws)
          .in("reply_status", ["pending_approval", "failed"])
          .order("created_at", { ascending: false })
          .limit(50),
      );
    },

    async replyToComment(commentId, text) {
      await sendCommentReply({ workspaceId: ws, commentId, text });
      return { ok: true };
    },
  };
}
