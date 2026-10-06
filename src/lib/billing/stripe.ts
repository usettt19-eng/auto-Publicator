import "server-only";
import Stripe from "stripe";
import type { PlanTier } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { tierFromSubscription, type PriceMap } from "./tiers";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

let stripe: Stripe | null = null;
export const getStripe = () => (stripe ??= new Stripe(required("STRIPE_SECRET_KEY")));
export const billingEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

export const priceMap = (): PriceMap => ({
  self_serve: process.env.STRIPE_PRICE_SELF_SERVE,
  done_for_you: process.env.STRIPE_PRICE_DONE_FOR_YOU,
});

/** Cliente de Stripe del workspace (se crea la primera vez). */
async function ensureCustomer(workspaceId: string, email: string | undefined): Promise<string> {
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("workspace_id", workspaceId).maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;

  // La clave de idempotencia evita crear dos clientes si se pulsa dos veces.
  const customer = await getStripe().customers.create(
    { email, metadata: { workspace_id: workspaceId } },
    { idempotencyKey: `customer-${workspaceId}` },
  );
  const { error } = await admin
    .from("subscriptions")
    .upsert({ workspace_id: workspaceId, stripe_customer_id: customer.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  return customer.id;
}

export async function createCheckoutUrl(opts: { workspaceId: string; email?: string; tier: Exclude<PlanTier, "free">; appUrl: string }) {
  const price = priceMap()[opts.tier];
  if (!price) throw new Error(`Falta el precio de Stripe para el plan ${opts.tier}`);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: await ensureCustomer(opts.workspaceId, opts.email),
    client_reference_id: opts.workspaceId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { workspace_id: opts.workspaceId } },
    allow_promotion_codes: true,
    success_url: `${opts.appUrl}/billing?status=success`,
    cancel_url: `${opts.appUrl}/billing?status=cancelled`,
  });
  if (!session.url) throw new Error("Stripe no devolvió la URL de pago");
  return session.url;
}

export async function createPortalUrl(opts: { workspaceId: string; appUrl: string }) {
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("workspace_id", opts.workspaceId).maybeSingle();
  if (!sub?.stripe_customer_id) throw new Error("Este workspace aún no tiene suscripción");
  const session = await getStripe().billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${opts.appUrl}/billing` });
  return session.url;
}

/** Refleja en `subscriptions` el estado de una suscripción de Stripe. */
export async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = createAdminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let workspaceId = subscription.metadata?.workspace_id;
  if (!workspaceId) {
    const { data } = await admin.from("subscriptions").select("workspace_id").eq("stripe_customer_id", customerId).maybeSingle();
    workspaceId = data?.workspace_id;
  }
  if (!workspaceId) throw new Error(`No hay workspace para el cliente ${customerId}`);

  const items = subscription.items.data;
  const periodEnd = Math.max(0, ...items.map((i) => i.current_period_end ?? 0));
  const tier = tierFromSubscription({ status: subscription.status, priceIds: items.map((i) => i.price.id) }, priceMap());
  const { error } = await admin.from("subscriptions").upsert({
    workspace_id: workspaceId,
    tier,
    status: subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { workspaceId, tier };
}
