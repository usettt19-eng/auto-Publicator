"use server";

import { revalidatePath } from "next/cache";
import { verifyApprovalToken } from "@/lib/approval-token";
import { env } from "@/lib/env";
import { ReviewError, reviewReel, type ReviewInput } from "@/lib/reels/review";
import { requireWorkspace } from "@/lib/workspace";

export type ReviewResult = { ok: true } | { ok: false; error: string };

function toResult(err: unknown): ReviewResult {
  if (err instanceof ReviewError) return { ok: false, error: err.message };
  console.error("[review]", err);
  return { ok: false, error: "No se pudo completar la acción" };
}

/** Revisión desde el dashboard: requiere sesión y que el reel sea del workspace. */
export async function reviewFromDashboard(reelId: string, input: ReviewInput): Promise<ReviewResult> {
  const { user, workspace } = await requireWorkspace();
  try {
    await reviewReel({ reelId, workspaceId: workspace.id, actorId: user.id, input });
    revalidatePath("/reels");
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Revisión desde el enlace del email: el token firmado sustituye a la sesión. */
export async function reviewFromToken(token: string, input: ReviewInput): Promise<ReviewResult> {
  const claims = verifyApprovalToken(token, env.approvalLinkSecret());
  if (!claims) return { ok: false, error: "El enlace no es válido o ha caducado" };
  // Desde el email solo se permiten las acciones de la página pública.
  if (!["approve", "request_changes", "reject", "edit_caption"].includes(input.action)) {
    return { ok: false, error: "Acción no disponible desde el enlace" };
  }
  try {
    await reviewReel({ reelId: claims.reelId, expectedRevision: claims.revision, actorId: null, input });
    revalidatePath(`/r/${token}`);
    revalidatePath("/reels");
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
