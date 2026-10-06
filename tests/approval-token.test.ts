import { describe, expect, it } from "vitest";
import { createApprovalToken, verifyApprovalToken } from "@/lib/approval-token";

const secret = "test-secret";
const claims = { reelId: "11111111-1111-1111-1111-111111111111", revision: 2, exp: Date.now() + 60_000 };

describe("approval token", () => {
  it("verifica un token válido", () => {
    expect(verifyApprovalToken(createApprovalToken(claims, secret), secret)).toEqual(claims);
  });

  it("rechaza firmas incorrectas, payloads alterados y tokens caducados", () => {
    const token = createApprovalToken(claims, secret);
    expect(verifyApprovalToken(token, "otro-secreto")).toBeNull();
    const forged = Buffer.from(JSON.stringify({ ...claims, reelId: "otro" })).toString("base64url");
    expect(verifyApprovalToken(`${forged}.${token.split(".")[1]}`, secret)).toBeNull();
    expect(verifyApprovalToken(createApprovalToken({ ...claims, exp: Date.now() - 1 }, secret), secret)).toBeNull();
    expect(verifyApprovalToken("basura", secret)).toBeNull();
  });
});
