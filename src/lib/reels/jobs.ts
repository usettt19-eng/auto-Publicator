import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobKind = "generate_script" | "render_reel";
export type JobPayload = { reelId: string; feedback?: string };
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

/** Reintenta con backoff exponencial (30 s, 2 min…) hasta MAX_ATTEMPTS. Devuelve si se dio por fallido. */
export async function failJob(job: Job, message: string): Promise<boolean> {
  const admin = createAdminClient();
  const exhausted = job.attempts >= MAX_ATTEMPTS;
  await admin
    .from("jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      last_error: message,
      run_after: new Date(Date.now() + 30_000 * 4 ** (job.attempts - 1)).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return exhausted;
}
