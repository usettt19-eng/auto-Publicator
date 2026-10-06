import type { ContainerStatus, InstagramMedia } from "@/lib/instagram/api";
import { DeferJobError, PermanentJobError } from "./job-errors";

/**
 * Publicación idempotente de un reel. Cada paso guarda su progreso para que un reintento
 * (o un worker que se cayó a mitad) continúe sin publicar dos veces:
 *
 *   contenedor guardado → espera a FINISHED → comprobar cuota → media_publish → guardar media
 *
 * Si el contenedor ya figura como PUBLISHED (el proceso murió tras publicar y antes de
 * guardar), se recupera el media buscando el reel entre las publicaciones recientes.
 */
export type PublishDeps = {
  api: {
    createContainer(): Promise<string>;
    getContainerStatus(containerId: string): Promise<{ code: ContainerStatus; detail: string | null }>;
    getQuota(): Promise<{ used: number; total: number }>;
    publish(containerId: string): Promise<string>;
    getPermalink(mediaId: string): Promise<string | null>;
    listRecentMedia(): Promise<InstagramMedia[]>;
  };
  store: {
    saveContainer(containerId: string | null): Promise<void>;
    markPublished(result: { mediaId: string | null; permalink: string | null }): Promise<void>;
  };
  sleep(ms: number): Promise<void>;
  now(): number;
};

export type PublishInput = {
  containerId: string | null;
  /**
   * Reutilizar un contenedor sin publicar solo en reintentos del mismo trabajo. En una nueva
   * aprobación el caption pudo cambiar, así que se crea otro (los viejos caducan solos en 24 h).
   */
  reuseContainer: boolean;
  caption: string;
  scheduledAt: string;
};

export type PublishOutcome = "published" | "recovered";

export const POLL_INTERVAL_MS = 5_000;
export const MAX_POLL_MS = 4 * 60_000;
export const QUOTA_RETRY_SECONDS = 60 * 60;

/** Busca entre las publicaciones recientes el reel que ya se publicó (recuperación tras caída). */
export function matchPublishedReel(media: InstagramMedia[], opts: { caption: string; since: Date }): InstagramMedia | null {
  const normalize = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const caption = normalize(opts.caption);
  return (
    media.find(
      (m) =>
        (m.media_product_type === "REELS" || m.media_type === "VIDEO") &&
        new Date(m.timestamp).getTime() >= opts.since.getTime() - 5 * 60_000 &&
        normalize(m.caption) === caption,
    ) ?? null
  );
}

async function recover(deps: PublishDeps, input: PublishInput): Promise<PublishOutcome> {
  const media = await deps.api.listRecentMedia().catch(() => []);
  const match = matchPublishedReel(media, { caption: input.caption, since: new Date(input.scheduledAt) });
  // Ya está publicado aunque no lo encontremos: nunca se vuelve a publicar.
  await deps.store.markPublished({ mediaId: match?.id ?? null, permalink: match?.permalink ?? null });
  return "recovered";
}

export async function publishReel(deps: PublishDeps, input: PublishInput): Promise<PublishOutcome> {
  let containerId = input.containerId;

  if (containerId) {
    const status = await deps.api.getContainerStatus(containerId);
    if (status.code === "PUBLISHED") return recover(deps, input);
    if (status.code === "EXPIRED" || status.code === "ERROR" || !input.reuseContainer) containerId = null;
  }

  if (!containerId) {
    containerId = await deps.api.createContainer();
    await deps.store.saveContainer(containerId);
  }

  // Esperar a que Instagram procese el video.
  const deadline = deps.now() + MAX_POLL_MS;
  for (;;) {
    const status = await deps.api.getContainerStatus(containerId);
    if (status.code === "FINISHED") break;
    if (status.code === "PUBLISHED") return recover(deps, input);
    if (status.code === "ERROR") {
      await deps.store.saveContainer(null);
      throw new PermanentJobError(`Instagram rechazó el video${status.detail ? `: ${status.detail}` : ""}`);
    }
    if (status.code === "EXPIRED") {
      await deps.store.saveContainer(null);
      throw new Error("El contenedor de Instagram caducó; se creará otro en el siguiente intento");
    }
    if (deps.now() >= deadline) throw new Error("Instagram sigue procesando el video; se reintentará");
    await deps.sleep(POLL_INTERVAL_MS);
  }

  const quota = await deps.api.getQuota();
  if (quota.used >= quota.total) {
    throw new DeferJobError(`Límite diario de publicaciones alcanzado (${quota.used}/${quota.total})`, QUOTA_RETRY_SECONDS);
  }

  const mediaId = await deps.api.publish(containerId);
  const permalink = await deps.api.getPermalink(mediaId).catch(() => null);
  await deps.store.markPublished({ mediaId, permalink });
  return "published";
}
