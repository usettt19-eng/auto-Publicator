import "server-only";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { APPROVAL_LINK_TTL_MS, createApprovalToken } from "@/lib/approval-token";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { sendReelReadyEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { searchVerticalClip } from "@/lib/media/pexels";
import { synthesizeSpeech } from "@/lib/media/tts";
import { generateReelScript } from "@/lib/reels/content";
import { getAccessToken } from "@/lib/instagram/accounts";
import {
  createReelContainer,
  getContainerStatus,
  getMediaPermalink,
  getPublishingQuota,
  getRecentMedia,
  publishContainer,
} from "@/lib/instagram/api";
import { currentPeriodStart } from "@/lib/plans";
import { enqueueJob, PermanentJobError, type Job } from "@/lib/reels/jobs";
import { publishReel } from "@/lib/reels/publish-flow";
import { buildFullCaption, type ReelScript } from "@/lib/reels/schema";
import { assertPublicHost } from "@/lib/scraper/url-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPOSITION_ID, FPS, type ReelProps, type ReelScene } from "@/remotion/types";

const BUCKET = "reels";

type ReelRow = {
  id: string;
  workspace_id: string;
  idea_id: string | null;
  status: string;
  revision: number;
  title: string | null;
  script_json: ReelScript | null;
};

async function loadReel(reelId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reels")
    .select("id, workspace_id, idea_id, status, revision, title, script_json")
    .eq("id", reelId)
    .single<ReelRow>();
  if (error) throw error;
  return data;
}

async function loadBrandKit(workspaceId: string): Promise<BrandKit> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("brand_kits").select("kit").eq("workspace_id", workspaceId).single();
  if (error) throw new Error("El workspace no tiene Brand Kit");
  return data.kit as BrandKit;
}

async function setReel(reelId: string, fields: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("reels")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", reelId);
  if (error) throw error;
}

async function upload(objectPath: string, body: Buffer, contentType: string): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(objectPath, body, { contentType, upsert: true });
  if (error) throw new Error(`Error subiendo ${objectPath}: ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

// ---------------------------------------------------------------------------
// generate_script
// ---------------------------------------------------------------------------

export async function handleGenerateScript(job: Job) {
  const admin = createAdminClient();
  const reel = await loadReel(job.payload.reelId);
  if (!["queued", "changes_requested", "scripting"].includes(reel.status)) return;

  await setReel(reel.id, { status: "scripting" });
  const kit = await loadBrandKit(reel.workspace_id);

  let idea = { title: reel.title ?? "Reel", hook: null as string | null, format: null as string | null, pillar: null as string | null };
  if (reel.idea_id) {
    const { data } = await admin
      .from("reel_ideas")
      .select("title, hook, format, content_pillars(name)")
      .eq("id", reel.idea_id)
      .maybeSingle();
    if (data) {
      const pillar = data.content_pillars as unknown as { name: string } | null;
      idea = { title: data.title, hook: data.hook, format: data.format, pillar: pillar?.name ?? null };
    }
  }

  const script = await generateReelScript({
    kit,
    idea,
    previous: job.payload.feedback && reel.script_json ? { script: reel.script_json, feedback: job.payload.feedback } : undefined,
  });

  await setReel(reel.id, {
    status: "rendering",
    script_json: script,
    title: script.title,
    caption: buildFullCaption(script),
  });
  await enqueueJob(reel.workspace_id, "render_reel", { reelId: reel.id });
}

// ---------------------------------------------------------------------------
// render_reel
// ---------------------------------------------------------------------------

let serveUrlPromise: Promise<string> | null = null;
/** El bundle de Remotion se construye una vez por proceso. */
function getServeUrl() {
  serveUrlPromise ??= bundle({ entryPoint: path.join(process.cwd(), "src/remotion/index.tsx") });
  return serveUrlPromise;
}

const browserExecutable = () => process.env.REMOTION_BROWSER_EXECUTABLE || null;

/** Solo usa el logo si es una imagen pública accesible; un logo roto haría fallar el render. */
async function usableLogo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    await assertPublicHost(parsed);
    const res = await fetch(parsed, { method: "GET", signal: AbortSignal.timeout(8000) });
    await res.body?.cancel();
    return res.ok && res.headers.get("content-type")?.startsWith("image/") ? url : null;
  } catch {
    return null;
  }
}

async function buildScenes(reel: ReelRow, script: ReelScript): Promise<ReelScene[]> {
  const pexelsKey = env.pexelsApiKey();
  const ttsKey = env.elevenLabsApiKey();
  const usedClips = new Set<number>();
  const scenes: ReelScene[] = [];

  for (const [i, scene] of script.scenes.entries()) {
    let seconds = scene.duration_seconds;
    let audioUrl: string | null = null;
    let words: ReelScene["words"] = [];

    if (ttsKey && scene.voiceover) {
      const speech = await synthesizeSpeech(scene.voiceover, { apiKey: ttsKey, voiceId: env.elevenLabsVoiceId() });
      seconds = Math.max(seconds, speech.durationSeconds + 0.35);
      audioUrl = await upload(`${reel.workspace_id}/${reel.id}/r${reel.revision}/voice-${i}.mp3`, speech.audio, "audio/mpeg");
      words = speech.words.map((w) => ({
        word: w.word,
        startFrame: Math.round(w.start * FPS),
        endFrame: Math.max(Math.round(w.end * FPS), Math.round(w.start * FPS) + 1),
      }));
    }

    let videoUrl: string | null = null;
    if (pexelsKey) {
      const clip = await searchVerticalClip(scene.broll_query, { apiKey: pexelsKey, minDuration: Math.ceil(seconds), exclude: usedClips }).catch(
        (err) => {
          console.warn(`[render] Pexels falló para "${scene.broll_query}"`, err);
          return null;
        },
      );
      if (clip) {
        usedClips.add(clip.pexelsId);
        videoUrl = clip.url;
      }
    }

    scenes.push({ durationInFrames: Math.round(seconds * FPS), text: scene.on_screen_text, videoUrl, audioUrl, words });
  }
  return scenes;
}

export async function handleRenderReel(job: Job) {
  const reel = await loadReel(job.payload.reelId);
  // "queued" llega desde "Reintentar" cuando el guion ya existía.
  if (!["rendering", "queued"].includes(reel.status) || !reel.script_json) return;
  if (reel.status === "queued") await setReel(reel.id, { status: "rendering" });
  const script = reel.script_json;
  const kit = await loadBrandKit(reel.workspace_id);
  const colors = kit.visual_identity;

  const props: ReelProps = {
    brand: {
      name: kit.brand_name,
      primary: colors.primary_colors[0] ?? "#db2777",
      secondary: colors.primary_colors[1] ?? colors.secondary_colors[0] ?? "#f9a8d4",
      fontFamily: colors.fonts[0] ?? null,
      logoUrl: await usableLogo(colors.logo_url),
    },
    scenes: await buildScenes(reel, script),
    cta: script.cta,
  };

  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps: props, browserExecutable: browserExecutable() });
  const outFile = path.join(tmpdir(), `reel-${reel.id}-r${reel.revision}.mp4`);
  const thumbFile = path.join(tmpdir(), `reel-${reel.id}-r${reel.revision}.jpg`);

  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: "h264",
      outputLocation: outFile,
      browserExecutable: browserExecutable(),
      audioCodec: "aac",
      enforceAudioTrack: true,
    });
    await renderStill({
      serveUrl,
      composition,
      inputProps: props,
      frame: Math.min(45, composition.durationInFrames - 1),
      output: thumbFile,
      imageFormat: "jpeg",
      browserExecutable: browserExecutable(),
    });

    const base = `${reel.workspace_id}/${reel.id}/r${reel.revision}`;
    const videoUrl = await upload(`${base}/reel.mp4`, await readFile(outFile), "video/mp4");
    const thumbnailUrl = await upload(`${base}/thumb.jpg`, await readFile(thumbFile), "image/jpeg");

    await setReel(reel.id, {
      status: "ready",
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      duration_seconds: composition.durationInFrames / FPS,
      error: null,
    });
    await notifyReelReady(reel.id).catch((err) => console.error("[email] no se pudo enviar", err));
  } finally {
    await Promise.all([rm(outFile, { force: true }), rm(thumbFile, { force: true })]);
  }
}

async function notifyReelReady(reelId: string) {
  const admin = createAdminClient();
  const { data: reel } = await admin
    .from("reels")
    .select("id, workspace_id, revision, title, caption, thumbnail_url, workspaces(owner_id, name)")
    .eq("id", reelId)
    .single();
  if (!reel) return;
  const ws = reel.workspaces as unknown as { owner_id: string; name: string };
  const { data: owner } = await admin.auth.admin.getUserById(ws.owner_id);
  if (!owner.user?.email) return;
  const kit = await loadBrandKit(reel.workspace_id).catch(() => null);

  const token = createApprovalToken(
    { reelId: reel.id, revision: reel.revision, exp: Date.now() + APPROVAL_LINK_TTL_MS },
    env.approvalLinkSecret(),
  );
  await sendReelReadyEmail({
    to: owner.user.email,
    brandName: kit?.brand_name ?? ws.name,
    reelTitle: reel.title ?? "Nuevo reel",
    caption: reel.caption ?? "",
    thumbnailUrl: reel.thumbnail_url,
    reviewUrl: `${env.appUrl()}/r/${token}`,
  });
}

// ---------------------------------------------------------------------------
// publish_reel
// ---------------------------------------------------------------------------

type PublishRow = {
  id: string;
  workspace_id: string;
  status: string;
  caption: string | null;
  video_url: string | null;
  scheduled_at: string | null;
  ig_container_id: string | null;
  instagram_account_id: string | null;
};

export async function handlePublishReel(job: Job) {
  const admin = createAdminClient();
  const { data: reel, error } = await admin
    .from("reels")
    .select("id, workspace_id, status, caption, video_url, scheduled_at, ig_container_id, instagram_account_id")
    .eq("id", job.payload.reelId)
    .single<PublishRow>();
  if (error) throw error;
  if (reel.status !== "publishing") return;
  if (!reel.video_url) throw new PermanentJobError("El reel no tiene video");

  // La cuenta del reel o, si se creó antes de conectar Instagram, la más reciente del workspace.
  let accountQuery = admin.from("instagram_accounts").select("id, ig_user_id").eq("workspace_id", reel.workspace_id);
  accountQuery = reel.instagram_account_id ? accountQuery.eq("id", reel.instagram_account_id) : accountQuery;
  const { data: account } = await accountQuery.order("connected_at", { ascending: false }).limit(1).maybeSingle();
  if (!account) throw new PermanentJobError("No hay ninguna cuenta de Instagram conectada");

  let token: string;
  try {
    token = await getAccessToken(account.id);
  } catch (err) {
    throw new PermanentJobError(err instanceof Error ? err.message : "Token de Instagram no válido; vuelve a conectar la cuenta");
  }

  const igUserId = account.ig_user_id as string;
  const caption = reel.caption ?? "";
  const outcome = await publishReel(
    {
      api: {
        createContainer: () => createReelContainer({ igUserId, accessToken: token, videoUrl: reel.video_url!, caption }),
        getContainerStatus: (id) => getContainerStatus(id, token),
        getQuota: () => getPublishingQuota(igUserId, token),
        publish: (containerId) => publishContainer({ igUserId, accessToken: token, containerId }),
        getPermalink: (mediaId) => getMediaPermalink(mediaId, token),
        listRecentMedia: () => getRecentMedia(token, 10),
      },
      store: {
        saveContainer: (containerId) => setReel(reel.id, { ig_container_id: containerId, instagram_account_id: account.id }),
        markPublished: async ({ mediaId, permalink }) => {
          await setReel(reel.id, {
            status: "published",
            published_at: new Date().toISOString(),
            ig_media_id: mediaId,
            ig_permalink: permalink,
            error: null,
            failed_stage: null,
          });
          await admin.rpc("increment_usage", {
            p_workspace: reel.workspace_id,
            p_period: currentPeriodStart(),
            p_field: "reels_published",
          });
        },
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
    },
    {
      containerId: reel.ig_container_id,
      reuseContainer: job.attempts > 1,
      caption,
      scheduledAt: reel.scheduled_at ?? new Date().toISOString(),
    },
  );
  console.info(`[publish] reel ${reel.id}: ${outcome}`);
}

const STAGE_FOR: Record<Job["kind"], "script" | "render" | "publish"> = {
  generate_script: "script",
  render_reel: "render",
  publish_reel: "publish",
};

/** Marca el reel como fallido cuando su trabajo agota los reintentos o falla sin remedio. */
export async function markReelFailed(job: Job, message: string) {
  await setReel(job.payload.reelId, { status: "failed", error: message.slice(0, 1000), failed_stage: STAGE_FOR[job.kind] });
}

export const handlers: Record<Job["kind"], (job: Job) => Promise<void>> = {
  generate_script: handleGenerateScript,
  render_reel: handleRenderReel,
  publish_reel: handlePublishReel,
};
