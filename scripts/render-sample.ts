/**
 * Renderiza un reel de ejemplo con la plantilla real, sin claves ni base de datos.
 * Uso: npm run render:sample   → out/sample.mp4 y out/sample.jpg
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { COMPOSITION_ID, FPS, type ReelProps } from "../src/remotion/types";

const words = (text: string, startSec: number, perWord = 0.38) =>
  text.split(" ").map((word, i) => ({
    word,
    startFrame: Math.round((startSec + i * perWord) * FPS),
    endFrame: Math.round((startSec + (i + 1) * perWord) * FPS),
  }));

const props: ReelProps = {
  brand: { name: "Café Luna", primary: "#e07a5f", secondary: "#f2cc8f", fontFamily: null, logoUrl: null },
  cta: "Comenta CAFÉ 👇",
  scenes: [
    { durationInFrames: 3 * FPS, text: "¿Tu café sabe amargo?", videoUrl: null, audioUrl: null, words: words("¿Tu café sabe amargo? No es culpa del grano", 0.2, 0.3) },
    { durationInFrames: 4 * FPS, text: "El error está en el agua", videoUrl: null, audioUrl: null, words: words("El agua hirviendo quema el café y saca el amargor", 0.2) },
    { durationInFrames: 4 * FPS, text: "Usa agua a 92 °C", videoUrl: null, audioUrl: null, words: words("Déjala reposar treinta segundos antes de servir", 0.2) },
  ],
};

async function main() {
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const outDir = path.join(process.cwd(), "out");
  await mkdir(outDir, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), "src/remotion/index.tsx") });
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps: props, browserExecutable });
  await renderMedia({ serveUrl, composition, inputProps: props, codec: "h264", outputLocation: path.join(outDir, "sample.mp4"), browserExecutable });
  await renderStill({ serveUrl, composition, inputProps: props, frame: 45, output: path.join(outDir, "sample.jpg"), imageFormat: "jpeg", browserExecutable });
  console.info(`Listo: out/sample.mp4 (${composition.durationInFrames / FPS} s) y out/sample.jpg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
