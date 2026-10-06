import type { PlanTier } from "@/lib/plans";

/** Estados de Stripe que dan acceso al plan de pago (past_due: periodo de gracia mientras Stripe reintenta el cobro). */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export type PriceMap = Partial<Record<Exclude<PlanTier, "free">, string>>;

/** Plan que corresponde a una suscripción de Stripe. */
export function tierFromSubscription(sub: { status: string; priceIds: string[] }, prices: PriceMap): PlanTier {
  if (!PAID_STATUSES.has(sub.status)) return "free";
  if (prices.done_for_you && sub.priceIds.includes(prices.done_for_you)) return "done_for_you";
  if (prices.self_serve && sub.priceIds.includes(prices.self_serve)) return "self_serve";
  return "free";
}

export const PLAN_INFO: Record<PlanTier, { name: string; description: string }> = {
  free: { name: "Gratis", description: "10 reels al mes para probar" },
  self_serve: { name: "Self-serve", description: "100 reels al mes, tú apruebas y publicas en automático" },
  done_for_you: { name: "Done-for-you", description: "Hasta 30 reels por semana y respuestas automáticas" },
};
