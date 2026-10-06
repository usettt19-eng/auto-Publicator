import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export { DeferJobError, PermanentJobError } from "./job-errors";

export type JobKind =
  | "generate_script"
  | "render_reel"
  | "publish_reel"
  | "handle_comment"
  | "handle_dm"
  | "sync_insights"
  | "weekly_report";
export type JobPayload = { reelId?: string; feedback?: string; commentId?: string; dmId?: string };

export const REEL_JOB_KINDS: JobKind[] = ["generate_script", "render_reel", "publish_reel"];

/** Los trabajos de reels siempre llevan reelId. */
export function requireReelId(job: { payload: JobPayload }): string {
  if (!job.payload.reelId) throw new Error("Trabajo sin reelId");
  return job.payload.reelId;
}
export type Job = {
  id: string;
  workspace_id: string;
  kind: JobKind;
  payload: JobPayload;
  attempts: number;
};

export const MAX_ATTEMPTS = 3;

export async function enqueueJob(workspaceId: string, kind: JobKind, payload: JobPayload, delaySeconds = 0) {
  const admin = createAdminClient();
  const { error } = await admin.from("jobs").insert({
    workspace_id: workspaceId,
    kind,
    payload,
    run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
  });
  if (error) throw error;
}

export async function claimJob(kinds: JobKind[]): Promise<Job | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_job", { p_kinds: kinds });
  if (error) throw error;
  return ((data as Job[] | null) ?? [])[0] ?? null;
}

export async function completeJob(jobId: string) {
  const admin = createAdminClient();
  await admin.from("jobs").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", jobId);
}

/**
 * Reintenta con backoff exponencial (30 s, 2 min…) hasta MAX_ATTEMPTS, o falla del todo si
 * `permanent`. Devuelve si el trabajo quedó como fallido definitivamente.
 */
export async function failJob(job: Job, message: string, opts: { permanent?: boolean } = {}): Promise<boolean> {
  const admin = createAdminClient();
  const exhausted = opts.permanent || job.attempts >= MAX_ATTEMPTS;
  await admin
    .from("jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      last_error: message,
      run_after: new Date(Date.now() + 30_000 * 4 ** Math.max(0, Math.min(job.attempts, MAX_ATTEMPTS) - 1)).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return exhausted;
}

export async function deferJob(job: Job, delaySeconds: number, reason: string) {
  const admin = createAdminClient();
  await admin
    .from("jobs")
    .update({
      status: "queued",
      attempts: Math.max(0, job.attempts - 1),
      last_error: reason,
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

/** Encola la publicación de los reels aprobados cuya hora ya llegó. */
export async function enqueueDuePublications(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("enqueue_due_publications", { p_limit: 20 });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** Encola la sincronización de métricas (cada 6 h) y los informes semanales pendientes. */
export async function enqueuePeriodicJobs(): Promise<{ insights: number; reports: number }> {
  const admin = createAdminClient();
  const [insights, reports] = await Promise.all([
    admin.rpc("enqueue_insight_syncs", { p_interval: "6 hours" }),
    admin.rpc("enqueue_weekly_reports"),
  ]);
  if (insights.error) throw insights.error;
  if (reports.error) throw reports.error;
  return { insights: (insights.data as number | null) ?? 0, reports: (reports.data as number | null) ?? 0 };
}
