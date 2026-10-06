import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("cifra y descifra", () => {
    const token = "IGQVJ-secret-token";
    const payload = encrypt(token, key);
    expect(payload).not.toContain(token);
    expect(decrypt(payload, key)).toBe(token);
  });

  it("usa un IV distinto cada vez", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("rechaza datos manipulados", () => {
    const [v, iv, tag, ct] = encrypt("hola", key).split(".");
    const tampered = [v, iv, tag, Buffer.from("adios").toString("base64url") + ct.slice(7)].join(".");
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("rechaza claves de longitud incorrecta", () => {
    expect(() => encrypt("x", randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
