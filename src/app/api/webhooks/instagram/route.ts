import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ingestInstagramWebhook } from "@/lib/engagement/process";
import { verifyMetaSignature } from "@/lib/engagement/webhook";
import { env } from "@/lib/env";

/** Verificación de la suscripción: Meta envía hub.challenge y espera recibirlo de vuelta. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("hub.verify_token") ?? "";
  const expected = env.instagramWebhookVerifyToken();
  const valid =
    params.get("hub.mode") === "subscribe" &&
    token.length === expected.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!valid) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
}

/** Eventos de comentarios y mensajes. Se guardan y se procesan en el worker. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), env.instagramAppSecret())) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  try {
    const result = await ingestInstagramWebhook(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 500 → Meta reintenta la entrega; el guardado es idempotente.
    console.error("[webhook/instagram]", err);
    return new NextResponse("Error", { status: 500 });
  }
}
