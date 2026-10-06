import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  continueRender,
  delayRender,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { darken, readableTextOn } from "./colors";
import type { CaptionWord, ReelProps, ReelScene } from "./types";

const FALLBACK_FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/** Carga la fuente de Google Fonts de la marca; si falla, sigue con la de respaldo. */
function useBrandFont(family: string | null) {
  const [handle] = useState(() => (family ? delayRender(`Cargando fuente ${family}`, { timeoutInMilliseconds: 15_000 }) : null));
  useEffect(() => {
    if (!family || handle === null) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@600;800&display=block`;
    document.head.appendChild(link);
    const done = () => continueRender(handle);
    const timer = setTimeout(done, 5000);
    link.onload = () => {
      document.fonts.load(`800 64px "${family}"`).finally(() => {
        clearTimeout(timer);
        done();
      });
    };
    link.onerror = () => {
      clearTimeout(timer);
      done();
    };
  }, [family, handle]);
  return family ? `'${family}', ${FALLBACK_FONT}` : FALLBACK_FONT;
}

function Background({ scene, brand }: { scene: ReelScene; brand: ReelProps["brand"] }) {
  const frame = useCurrentFrame();
  if (scene.videoUrl) {
    const scale = interpolate(frame, [0, scene.durationInFrames], [1.05, 1.15]);
    return (
      <AbsoluteFill>
        <OffthreadVideo src={scene.videoUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.65) 100%)" }} />
      </AbsoluteFill>
    );
  }
  const angle = interpolate(frame, [0, scene.durationInFrames], [135, 165]);
  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(${angle}deg, ${darken(brand.primary, 0.55)} 0%, ${darken(brand.secondary, 0.35)} 100%)` }}
    />
  );
}

function SceneText({ text, brand, font }: { text: string; brand: ReelProps["brand"]; font: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!text) return null;
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 420, paddingLeft: 80, paddingRight: 80 }}>
      <div
        style={{
          fontFamily: font,
          fontWeight: 800,
          fontSize: text.length > 40 ? 78 : 96,
          lineHeight: 1.1,
          textAlign: "center",
          color: readableTextOn(brand.primary),
          background: brand.primary,
          padding: "24px 40px",
          borderRadius: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          transform: `translateY(${(1 - enter) * 80}px) scale(${0.9 + enter * 0.1})`,
          opacity: enter,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** Subtítulos por palabra: muestra un grupo de hasta 4 palabras y resalta la actual. */
function Captions({ words, brand, font }: { words: CaptionWord[]; brand: ReelProps["brand"]; font: string }) {
  const frame = useCurrentFrame();
  const currentIndex = words.findIndex((w) => frame >= w.startFrame && frame < w.endFrame);
  const anchor = currentIndex >= 0 ? currentIndex : words.findLastIndex((w) => w.endFrame <= frame);
  if (anchor < 0 || (currentIndex < 0 && frame - words[anchor].endFrame > 10)) return null;
  const groupStart = Math.floor(anchor / 4) * 4;
  const group = words.slice(groupStart, groupStart + 4);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380, paddingLeft: 70, paddingRight: 70 }}>
      <div style={{ fontFamily: font, fontWeight: 800, fontSize: 68, textAlign: "center", lineHeight: 1.25, textShadow: "0 4px 18px rgba(0,0,0,0.8)" }}>
        {group.map((w, i) => (
          <span key={groupStart + i} style={{ color: groupStart + i === currentIndex ? brand.secondary : "#ffffff", marginRight: 18 }}>
            {w.word}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Progress({ total, color }: { total: number; color: string }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 0, left: 0, height: 10, width: `${(frame / total) * 100}%`, background: color }} />
  );
}

function CtaBadge({ cta, brand, font, durationInFrames }: { cta: string; brand: ReelProps["brand"]; font: string; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - Math.max(0, durationInFrames - fps * 2.5), fps, config: { damping: 10 } });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 200 }}>
      <div
        style={{
          fontFamily: font,
          fontWeight: 800,
          fontSize: 56,
          color: readableTextOn(brand.secondary),
          background: brand.secondary,
          padding: "20px 44px",
          borderRadius: 999,
          transform: `scale(${pop})`,
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
}

export function Reel(props: ReelProps) {
  const { brand, scenes, cta } = props;
  const font = useBrandFont(brand.fontFamily);
  const starts = scenes.map((_, i) => scenes.slice(0, i).reduce((sum, s) => sum + s.durationInFrames, 0));
  const total = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {scenes.map((scene, i) => {
        const isLast = i === scenes.length - 1;
        return (
          <Sequence key={i} from={starts[i]} durationInFrames={scene.durationInFrames}>
            <Background scene={scene} brand={brand} />
            <SceneText text={scene.text} brand={brand} font={font} />
            <Captions words={scene.words} brand={brand} font={font} />
            {scene.audioUrl && <Audio src={scene.audioUrl} />}
            {isLast && cta && <CtaBadge cta={cta} brand={brand} font={font} durationInFrames={scene.durationInFrames} />}
          </Sequence>
        );
      })}
      {brand.logoUrl && (
        <Img src={brand.logoUrl} style={{ position: "absolute", top: 60, left: 60, height: 90, maxWidth: 320, objectFit: "contain" }} />
      )}
      <Progress total={total} color={brand.primary} />
    </AbsoluteFill>
  );
}
