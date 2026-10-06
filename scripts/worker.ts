/**
 * Worker de la cola `jobs`: guiones con Claude, render con Remotion y publicación en Instagram.
 * También hace de scheduler: cada SCHEDULER_MS encola los reels aprobados cuya hora llegó.
 * Uso: npm run worker   (necesita las mismas variables de entorno que la app)
 */
import {
  claimJob,
  completeJob,
  deferJob,
  DeferJobError,
  enqueueDuePublications,
  enqueuePeriodicJobs,
  failJob,
  PermanentJobError,
  type Job,
} from "@/lib/reels/jobs";
import { handlers, markReelFailed } from "@/worker/handlers";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000);
const SCHEDULER_MS = Number(process.env.SCHEDULER_MS ?? 30_000);
// WORKER_KINDS permite separar workers (p. ej. uno solo para publicar y otro para renders).
const KINDS = (process.env.WORKER_KINDS?.split(",") ?? [
  "publish_reel",
  "handle_comment",
  "handle_dm",
  "generate_script",
  "render_reel",
  "sync_insights",
  "weekly_report",
]) as Job["kind"][];
// Trabajos rápidos y sensibles al tiempo: se atienden antes que guiones y renders.
const PRIORITY: Job["kind"][] = ["publish_reel", "handle_comment", "handle_dm"];
let stopping = false;

async function runJob(job: Job) {
  const started = Date.now();
  const target = job.payload.reelId ?? job.payload.commentId ?? job.payload.dmId ?? `workspace ${job.workspace_id}`;
  console.info(`[worker] ${job.kind} ${target} (intento ${job.attempts})`);
  try {
    await handlers[job.kind](job);
    await completeJob(job.id);
    console.info(`[worker] ✓ ${job.kind} en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof DeferJobError) {
      console.warn(`[worker] ⏸ ${job.kind}: ${message}; se reintenta en ${err.delaySeconds} s`);
      await deferJob(job, err.delaySeconds, message);
      return;
    }
    console.error(`[worker] ✗ ${job.kind}: ${message}`);
    if (err instanceof PermanentJobError) {
      await failJob(job, message, { permanent: true });
      await markReelFailed(job, message);
      return;
    }
    const exhausted = await failJob(job, message);
    if (exhausted) await markReelFailed(job, message);
  }
}

async function claimNext(): Promise<Job | null> {
  const urgent = KINDS.filter((k) => PRIORITY.includes(k));
  if (urgent.length) {
    const job = await claimJob(urgent);
    if (job) return job;
  }
  const rest = KINDS.filter((k) => !PRIORITY.includes(k));
  return rest.length ? claimJob(rest) : null;
}

let lastSchedulerRun = 0;
async function runScheduler() {
  if (Date.now() - lastSchedulerRun < SCHEDULER_MS || !KINDS.includes("publish_reel")) return;
  lastSchedulerRun = Date.now();
  const queued = await enqueueDuePublications().catch((err) => {
    console.error("[scheduler] error", err);
    return 0;
  });
  if (queued) console.info(`[scheduler] ${queued} reels listos para publicar`);
}

const PERIODIC_MS = Number(process.env.PERIODIC_MS ?? 15 * 60_000);
let lastPeriodicRun = 0;
/** Métricas (cada 6 h por workspace) e informes semanales; las funciones SQL evitan duplicados. */
async function runPeriodic() {
  if (Date.now() - lastPeriodicRun < PERIODIC_MS || !KINDS.includes("sync_insights")) return;
  lastPeriodicRun = Date.now();
  const queued = await enqueuePeriodicJobs().catch((err) => {
    console.error("[scheduler] error en tareas periódicas", err);
    return null;
  });
  if (queued && (queued.insights || queued.reports)) {
    console.info(`[scheduler] ${queued.insights} sincronizaciones de métricas, ${queued.reports} informes semanales`);
  }
}

async function main() {
  console.info(`[worker] iniciado (${KINDS.join(", ")})`);
  while (!stopping) {
    await runScheduler();
    await runPeriodic();
    // Publicar y responder tienen prioridad: un render largo no debe retrasarlos.
    const job = await claimNext().catch((err) => {
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
