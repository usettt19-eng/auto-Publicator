/**
 * Worker de la cola `jobs`: guiones con Claude y render de video con Remotion.
 * Uso: npm run worker   (necesita las mismas variables de entorno que la app)
 */
import { claimJob, completeJob, failJob, type Job } from "@/lib/reels/jobs";
import { handlers, markReelFailed } from "@/worker/handlers";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000);
let stopping = false;

async function runJob(job: Job) {
  const started = Date.now();
  console.info(`[worker] ${job.kind} ${job.payload.reelId} (intento ${job.attempts})`);
  try {
    await handlers[job.kind](job);
    await completeJob(job.id);
    console.info(`[worker] ✓ ${job.kind} en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] ✗ ${job.kind}: ${message}`);
    const exhausted = await failJob(job, message);
    if (exhausted) await markReelFailed(job.payload.reelId, message);
  }
}

async function main() {
  console.info("[worker] iniciado");
  while (!stopping) {
    const job = await claimJob(["generate_script", "render_reel"]).catch((err) => {
      console.error("[worker] error al leer la cola", err);
      return null;
    });
    if (job) await runJob(job);
    else await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.info("[worker] detenido");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.info(`[worker] ${signal}: terminando el trabajo actual...`);
    stopping = true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
