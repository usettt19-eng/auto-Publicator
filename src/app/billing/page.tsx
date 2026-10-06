import { Card, Header } from "@/components/ui";
import { billingEnabled } from "@/lib/billing/stripe";
import { PLAN_INFO } from "@/lib/billing/tiers";
import { MONTHLY_REEL_LIMIT, type PlanTier } from "@/lib/plans";
import { getUsage } from "@/lib/reels/production";
import { requireWorkspace } from "@/lib/workspace";

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  success: { ok: true, text: "¡Pago completado! Tu plan se actualizará en unos segundos." },
  cancelled: { ok: false, text: "Pago cancelado. No se ha cobrado nada." },
  error: { ok: false, text: "No se pudo abrir Stripe. Inténtalo de nuevo." },
};

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { status } = await searchParams;
  const { supabase, user, workspace } = await requireWorkspace();
  const [{ data: sub }, usage] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("tier, status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    getUsage(workspace.id),
  ]);
  const tier = (sub?.tier ?? "free") as PlanTier;
  const message = typeof status === "string" ? MESSAGES[status] : undefined;
  const enabled = billingEnabled();
  const isOwner = workspace.owner_id === user.id;

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Plan y facturación</h1>
        {message && (
          <p className={`rounded-lg px-4 py-2 text-sm ${message.ok ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{message.text}</p>
        )}

        <Card className="flex flex-col gap-2">
          <p className="text-sm text-muted">Plan actual</p>
          <p className="text-xl font-semibold">{PLAN_INFO[tier].name}</p>
          <p className="text-sm">
            {usage.used} de {usage.limit} reels usados este mes
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-background">
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
          </div>
          {sub?.current_period_end && tier !== "free" && (
            <p className="text-xs text-muted">
              {sub.cancel_at_period_end ? "Se cancela" : "Se renueva"} el {new Date(sub.current_period_end).toLocaleDateString()}
              {sub.status === "past_due" && " · Hay un pago pendiente: actualiza tu tarjeta."}
            </p>
          )}
          {enabled && isOwner && sub?.stripe_customer_id && (
            <form action="/api/billing/portal" method="post">
              <button className="mt-2 text-sm text-accent hover:underline">Gestionar suscripción, tarjeta y facturas →</button>
            </form>
          )}
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["self_serve", "done_for_you"] as const).map((t) => (
            <Card key={t} className={`flex flex-col gap-2 ${t === tier ? "border-accent" : ""}`}>
              <p className="font-semibold">{PLAN_INFO[t].name}</p>
              <p className="text-sm text-muted">{PLAN_INFO[t].description}</p>
              <p className="text-sm">{MONTHLY_REEL_LIMIT[t]} reels/mes</p>
              {t === tier ? (
                <p className="mt-auto text-sm font-medium text-accent">Tu plan actual</p>
              ) : !enabled ? (
                <p className="mt-auto text-xs text-muted">Pagos no configurados (falta STRIPE_SECRET_KEY).</p>
              ) : !isOwner ? (
                <p className="mt-auto text-xs text-muted">Solo el dueño del workspace puede cambiar el plan.</p>
              ) : tier !== "free" ? (
                <form action="/api/billing/portal" method="post" className="mt-auto">
                  <button className="text-sm text-accent hover:underline">Cambiar de plan en Stripe →</button>
                </form>
              ) : (
                <form action="/api/billing/checkout" method="post" className="mt-auto">
                  <input type="hidden" name="tier" value={t} />
                  <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Elegir {PLAN_INFO[t].name}</button>
                </form>
              )}
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
