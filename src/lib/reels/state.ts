export type ReelStatus =
  | "idea"
  | "queued"
  | "scripting"
  | "rendering"
  | "ready"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed";

export type ReviewAction =
  | "approve"
  | "reject"
  | "request_changes"
  | "edit_caption"
  | "reschedule"
  | "unapprove"
  | "retry";

/** Estados desde los que una persona puede ejecutar cada acción de revisión. */
const ALLOWED_FROM: Record<ReviewAction, ReelStatus[]> = {
  approve: ["ready"],
  reject: ["ready", "approved", "failed"],
  request_changes: ["ready", "approved", "failed"],
  edit_caption: ["ready", "approved"],
  reschedule: ["ready", "approved"],
  unapprove: ["approved"],
  retry: ["failed"],
};

const NEXT_STATUS: Partial<Record<ReviewAction, ReelStatus>> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  unapprove: "ready",
  retry: "queued",
};

export function canPerform(action: ReviewAction, status: ReelStatus): boolean {
  return ALLOWED_FROM[action].includes(status);
}

/** Estado resultante tras la acción; lanza un error si no está permitida. */
export function nextStatus(action: ReviewAction, status: ReelStatus): ReelStatus {
  if (!canPerform(action, status)) {
    throw new Error(`No se puede "${action}" un reel en estado "${status}"`);
  }
  return NEXT_STATUS[action] ?? status;
}

/** Regla central: solo un reel aprobado y con fecha llegada puede publicarse. */
export function isPublishable(reel: { status: ReelStatus; scheduled_at: string | null }, now = new Date()): boolean {
  return reel.status === "approved" && reel.scheduled_at !== null && new Date(reel.scheduled_at) <= now;
}

export const STATUS_LABEL: Record<ReelStatus, string> = {
  idea: "Idea",
  queued: "En cola",
  scripting: "Escribiendo guion",
  rendering: "Renderizando",
  ready: "Pendiente de aprobación",
  changes_requested: "Cambios solicitados",
  approved: "Aprobado",
  rejected: "Rechazado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falló",
};

export const IN_PROGRESS: ReelStatus[] = ["queued", "scripting", "rendering", "changes_requested"];
