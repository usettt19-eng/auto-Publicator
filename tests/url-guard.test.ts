import { describe, expect, it } from "vitest";
import { assertPublicHost, isPrivateAddress, normalizeWebsiteUrl } from "@/lib/scraper/url-guard";

describe("normalizeWebsiteUrl", () => {
  it("añade https y quita el hash", () => {
    expect(normalizeWebsiteUrl(" mimarca.com/#top ").toString()).toBe("https://mimarca.com/");
  });
  it("rechaza otros protocolos y credenciales", () => {
    expect(() => normalizeWebsiteUrl("ftp://x.com")).toThrow();
    expect(() => normalizeWebsiteUrl("https://user:pw@x.com")).toThrow();
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"])(
    "%s es privada",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "172.32.0.1", "2606:4700::1111"])("%s es pública", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("assertPublicHost", () => {
  it("bloquea localhost e IPs privadas literales", async () => {
    await expect(assertPublicHost(new URL("http://localhost:3000"))).rejects.toThrow();
    await expect(assertPublicHost(new URL("http://169.254.169.254/latest"))).rejects.toThrow();
    await expect(assertPublicHost(new URL("http://[::1]/"))).rejects.toThrow();
  });
});
