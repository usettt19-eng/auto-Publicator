import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscription } from "@/lib/billing/stripe";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Webhook no configurado", { status: 500 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Firma no válida", { status: 400 });
  }

  try {
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      // Se vuelve a leer la suscripción: el estado del evento puede llegar desordenado.
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await getStripe().subscriptions.retrieve(id));
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook/stripe]", event.type, err);
    return new NextResponse("Error", { status: 500 });
  }
}
