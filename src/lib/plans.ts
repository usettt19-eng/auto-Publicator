export type PlanTier = "free" | "self_serve" | "done_for_you";

/** Reels generados por mes según el plan. done_for_you ≈ 30 por semana. */
export const MONTHLY_REEL_LIMIT: Record<PlanTier, number> = {
  free: 10,
  self_serve: 100,
  done_for_you: 130,
};

/** Primer día del mes (UTC) en formato YYYY-MM-DD, clave de `usage_counters`. */
export function currentPeriodStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function remainingReels(tier: PlanTier, used: number): number {
  return Math.max(0, MONTHLY_REEL_LIMIT[tier] - used);
}
