import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "./jobs";
import { suggestNextSlot } from "./schedule";
import { nextStatus, type ReelStatus, type ReviewAction } from "./state";

export class ReviewError extends Error {}

const EVENT_FOR: Record<ReviewAction, string> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  edit_caption: "edited",
  reschedule: "rescheduled",
  unapprove: "unapproved",
  retry: "retried",
};

export type ReviewInput =
  | { action: "approve"; scheduledAt?: string | null }
  | { action: "reject"; note?: string }
  | { action: "request_changes"; note: string }
  | { action: "edit_caption"; caption: string }
  | { action: "reschedule"; scheduledAt: string }
  | { action: "unapprove" }
  | { action: "retry" };

type ReelRow = {
  id: string;
  workspace_id: string;
  status: ReelStatus;
  revision: number;
  scheduled_at: string | null;
  script_json: unknown;
};

function parseFutureDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ReviewError("Fecha no válida");
  if (date.getTime() < Date.now() + 5 * 60 * 1000) {
    throw new ReviewError("La fecha de publicación debe ser al menos 5 minutos en el futuro");
  }
  return date.toISOString();
}

async function nextFreeSlot(workspaceId: string, excludeReelId: string): Promise<string> {
  const admin = createAdminClient();
  const [{ data: ws }, { data: taken }] = await Promise.all([
    admin.from("workspaces").select("timezone, posting_hour").eq("id", workspaceId).single(),
    admin
      .from("reels")
      .select("scheduled_at")
      .eq("workspace_id", workspaceId)
      .in("status", ["approved", "publishing", "published"])
      .neq("id", excludeReelId)
      .gte("scheduled_at", new Date().toISOString()),
  ]);
  return suggestNextSlot({
    timeZone: ws?.timezone ?? "UTC",
    postingHour: ws?.posting_hour ?? 18,
    taken: (taken ?? []).map((r) => r.scheduled_at as string),
  }).toISOString();
}

/**
 * Aplica una acción de revisión. Quien llama debe haber verificado el acceso
 * (miembro del workspace o token de email válido para `expectedRevision`).
 */
export async function reviewReel(opts: {
  reelId: string;
  workspaceId?: string;
  expectedRevision?: number;
  actorId: string | null;
  input: ReviewInput;
}) {
  const admin = createAdminClient();
  const { data: reel, error } = await admin
    .from("reels")
    .select("id, workspace_id, status, revision, scheduled_at, script_json")
    .eq("id", opts.reelId)
    .maybeSingle<ReelRow>();
  if (error) throw error;
  if (!reel || (opts.workspaceId && reel.workspace_id !== opts.workspaceId)) throw new ReviewError("Reel no encontrado");
  if (opts.expectedRevision !== undefined && reel.revision !== opts.expectedRevision) {
    throw new ReviewError("Este enlace corresponde a una versión anterior del reel");
  }

  const { input } = opts;
  let status: ReelStatus;
  try {
    status = nextStatus(input.action, reel.status);
  } catch (err) {
    throw new ReviewError(err instanceof Error ? err.message : "Acción no permitida");
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  let note: string | null = null;

  switch (input.action) {
    case "approve":
      update.scheduled_at = input.scheduledAt
        ? parseFutureDate(input.scheduledAt)
        : reel.scheduled_at && new Date(reel.scheduled_at).getTime() > Date.now() + 5 * 60 * 1000
          ? reel.scheduled_at
          : await nextFreeSlot(reel.workspace_id, reel.id);
      note = `Programado para ${update.scheduled_at}`;
      break;
    case "reject":
      note = input.note?.trim() || null;
      break;
    case "request_changes":
      note = input.note.trim();
      if (!note) throw new ReviewError("Describe qué quieres cambiar");
      update.revision = reel.revision + 1;
      update.error = null;
      break;
    case "edit_caption":
      if (!input.caption.trim()) throw new ReviewError("El caption no puede estar vacío");
      update.caption = input.caption.trim().slice(0, 2200);
      break;
    case "reschedule":
      update.scheduled_at = parseFutureDate(input.scheduledAt);
      note = `Reprogramado para ${update.scheduled_at}`;
      break;
    case "retry":
      update.error = null;
      update.revision = reel.revision + 1;
      break;
    case "unapprove":
      break;
  }

  // Actualización condicionada al estado leído: evita carreras entre dos revisores.
  const { data: updated, error: updateError } = await admin
    .from("reels")
    .update(update)
    .eq("id", reel.id)
    .eq("status", reel.status)
    .eq("revision", reel.revision)
    .select("id");
  if (updateError) throw updateError;
  if (!updated?.length) throw new ReviewError("El reel cambió mientras lo revisabas; recarga la página");

  await admin.from("approval_events").insert({
    reel_id: reel.id,
    actor_id: opts.actorId,
    action: EVENT_FOR[input.action],
    note,
  });

  if (input.action === "request_changes") {
    await enqueueJob(reel.workspace_id, "generate_script", { reelId: reel.id, feedback: note! });
  } else if (input.action === "retry") {
    await enqueueJob(reel.workspace_id, reel.script_json ? "render_reel" : "generate_script", { reelId: reel.id });
  }
  return { status };
}
