import { describe, expect, it } from "vitest";
import { tierFromSubscription } from "@/lib/billing/tiers";

const prices = { self_serve: "price_ss", done_for_you: "price_dfy" };

describe("tierFromSubscription", () => {
  it("asigna el plan según el precio", () => {
    expect(tierFromSubscription({ status: "active", priceIds: ["price_ss"] }, prices)).toBe("self_serve");
    expect(tierFromSubscription({ status: "trialing", priceIds: ["price_dfy"] }, prices)).toBe("done_for_you");
  });
  it("mantiene el plan durante el periodo de gracia y lo quita al cancelar o impagar", () => {
    expect(tierFromSubscription({ status: "past_due", priceIds: ["price_ss"] }, prices)).toBe("self_serve");
    expect(tierFromSubscription({ status: "canceled", priceIds: ["price_ss"] }, prices)).toBe("free");
    expect(tierFromSubscription({ status: "unpaid", priceIds: ["price_dfy"] }, prices)).toBe("free");
    expect(tierFromSubscription({ status: "incomplete", priceIds: ["price_dfy"] }, prices)).toBe("free");
  });
  it("un precio desconocido no da acceso", () => {
    expect(tierFromSubscription({ status: "active", priceIds: ["price_otro"] }, prices)).toBe("free");
  });
});
