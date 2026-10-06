import { afterEach, describe, expect, it, vi } from "vitest";
import { createReelContainer, getContainerStatus, getPublishingQuota, InstagramApiError, publishContainer } from "@/lib/instagram/api";

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("Instagram Content Publishing API", () => {
  it("crea el contenedor como REELS con video, caption y share_to_feed", async () => {
    const fetch = mockFetch({ id: "c1" });
    await expect(createReelContainer({ igUserId: "123", accessToken: "tok", videoUrl: "https://x/v.mp4", caption: "Hola #cafe" })).resolves.toBe("c1");
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://graph.instagram.com/v23.0/123/media");
    expect(init?.method).toBe("POST");
    const params = init?.body as URLSearchParams;
    expect(Object.fromEntries(params)).toEqual({
      media_type: "REELS",
      video_url: "https://x/v.mp4",
      caption: "Hola #cafe",
      share_to_feed: "true",
      access_token: "tok",
    });
  });

  it("publica con creation_id", async () => {
    const fetch = mockFetch({ id: "m1" });
    await publishContainer({ igUserId: "123", accessToken: "tok", containerId: "c1" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://graph.instagram.com/v23.0/123/media_publish");
    expect((fetch.mock.calls[0][1]?.body as URLSearchParams).get("creation_id")).toBe("c1");
  });

  it("lee el estado del contenedor y la cuota", async () => {
    mockFetch({ status_code: "ERROR", status: "Error: formato no soportado" });
    await expect(getContainerStatus("c1", "tok")).resolves.toEqual({ code: "ERROR", detail: "Error: formato no soportado" });
    mockFetch({ data: [{ quota_usage: 7, config: { quota_total: 100 } }] });
    await expect(getPublishingQuota("123", "tok")).resolves.toEqual({ used: 7, total: 100 });
  });

  it("convierte los errores de la API en InstagramApiError con el mensaje de Meta", async () => {
    mockFetch({ error: { message: "Invalid OAuth access token" } }, 400);
    const err = await publishContainer({ igUserId: "1", accessToken: "x", containerId: "c" }).catch((e) => e);
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.message).toBe("Invalid OAuth access token");
  });
});
