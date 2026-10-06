import { describe, expect, it } from "vitest";
import type { ContainerStatus, InstagramMedia } from "@/lib/instagram/api";
import { DeferJobError, PermanentJobError } from "@/lib/reels/job-errors";
import { matchPublishedReel, MAX_POLL_MS, publishReel, type PublishDeps, type PublishInput } from "@/lib/reels/publish-flow";

/** Instagram simulado: guarda contenedores, estados y publicaciones. */
function fakeInstagram(opts: { statuses?: ContainerStatus[]; quota?: { used: number; total: number }; recent?: InstagramMedia[] } = {}) {
  const calls: string[] = [];
  const saved: (string | null)[] = [];
  const published: { mediaId: string | null; permalink: string | null }[] = [];
  const statuses = [...(opts.statuses ?? ["IN_PROGRESS", "FINISHED"])];
  let clock = 0;
  let containers = 0;

  const deps: PublishDeps = {
    api: {
      createContainer: async () => {
        calls.push("create");
        return `c${++containers}`;
      },
      getContainerStatus: async (id) => {
        calls.push(`status:${id}`);
        return { code: statuses.length > 1 ? statuses.shift()! : statuses[0], detail: "detalle" };
      },
      getQuota: async () => opts.quota ?? { used: 3, total: 100 },
      publish: async (id) => {
        calls.push(`publish:${id}`);
        return "m1";
      },
      getPermalink: async () => "https://instagram.com/reel/abc",
      listRecentMedia: async () => opts.recent ?? [],
    },
    store: {
      saveContainer: async (id) => void saved.push(id),
      markPublished: async (r) => void published.push(r),
    },
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
  };
  return { deps, calls, saved, published };
}

const input: PublishInput = { containerId: null, reuseContainer: false, caption: "Hola\n\n#cafe", scheduledAt: "2026-10-07T16:00:00Z" };

describe("publishReel", () => {
  it("publica: crea contenedor, espera FINISHED y publica una sola vez", async () => {
    const ig = fakeInstagram();
    await expect(publishReel(ig.deps, input)).resolves.toBe("published");
    expect(ig.calls).toEqual(["create", "status:c1", "status:c1", "publish:c1"]);
    expect(ig.saved).toEqual(["c1"]);
    expect(ig.published).toEqual([{ mediaId: "m1", permalink: "https://instagram.com/reel/abc" }]);
  });

  it("en un reintento reutiliza el contenedor guardado en vez de subir el video otra vez", async () => {
    const ig = fakeInstagram({ statuses: ["FINISHED"] });
    await publishReel(ig.deps, { ...input, containerId: "c9", reuseContainer: true });
    expect(ig.calls).toEqual(["status:c9", "status:c9", "publish:c9"]);
  });

  it("en una nueva aprobación descarta el contenedor viejo (el caption pudo cambiar)", async () => {
    const ig = fakeInstagram({ statuses: ["FINISHED"] });
    await publishReel(ig.deps, { ...input, containerId: "c9", reuseContainer: false });
    expect(ig.calls).toEqual(["status:c9", "create", "status:c1", "publish:c1"]);
  });

  it("si el contenedor ya está publicado, recupera el media y NO vuelve a publicar", async () => {
    const recent: InstagramMedia[] = [
      { id: "otro", caption: "Otro post", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-07T16:01:00Z" },
      { id: "m7", caption: "Hola  #cafe", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-07T16:02:00Z", permalink: "p7" },
    ];
    const ig = fakeInstagram({ statuses: ["PUBLISHED"], recent });
    await expect(publishReel(ig.deps, { ...input, containerId: "c9" })).resolves.toBe("recovered");
    expect(ig.calls.some((c) => c.startsWith("publish") || c === "create")).toBe(false);
    expect(ig.published).toEqual([{ mediaId: "m7", permalink: "p7" }]);
  });

  it("aunque no encuentre el media, marca como publicado (nunca duplica)", async () => {
    const ig = fakeInstagram({ statuses: ["PUBLISHED"] });
    await publishReel(ig.deps, { ...input, containerId: "c9", reuseContainer: true });
    expect(ig.published).toEqual([{ mediaId: null, permalink: null }]);
  });

  it("vuelve a crear el contenedor si había caducado", async () => {
    const ig = fakeInstagram({ statuses: ["EXPIRED", "FINISHED"] });
    await publishReel(ig.deps, { ...input, containerId: "c9", reuseContainer: true });
    expect(ig.calls).toEqual(["status:c9", "create", "status:c1", "publish:c1"]);
  });

  it("ERROR de Instagram es un fallo permanente y limpia el contenedor", async () => {
    const ig = fakeInstagram({ statuses: ["ERROR"] });
    await expect(publishReel(ig.deps, input)).rejects.toBeInstanceOf(PermanentJobError);
    expect(ig.saved).toEqual(["c1", null]);
    expect(ig.published).toEqual([]);
  });

  it("si Instagram tarda demasiado, falla de forma reintentable conservando el contenedor", async () => {
    const ig = fakeInstagram({ statuses: ["IN_PROGRESS"] });
    const err = await publishReel(ig.deps, input).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentJobError);
    expect(ig.saved).toEqual(["c1"]);
    expect(ig.calls.filter((c) => c.startsWith("status")).length).toBeGreaterThan(MAX_POLL_MS / 5000 - 2);
  });

  it("con la cuota diaria agotada aplaza en vez de publicar", async () => {
    const ig = fakeInstagram({ quota: { used: 100, total: 100 } });
    await expect(publishReel(ig.deps, input)).rejects.toBeInstanceOf(DeferJobError);
    expect(ig.calls.some((c) => c.startsWith("publish"))).toBe(false);
  });
});

describe("matchPublishedReel", () => {
  it("ignora publicaciones anteriores a la fecha programada", () => {
    const media: InstagramMedia[] = [
      { id: "viejo", caption: "Hola #cafe", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-01T10:00:00Z" },
    ];
    expect(matchPublishedReel(media, { caption: "Hola #cafe", since: new Date("2026-10-07T16:00:00Z") })).toBeNull();
  });
});
