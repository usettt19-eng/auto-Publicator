export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const COMPOSITION_ID = "Reel";

export type CaptionWord = { word: string; startFrame: number; endFrame: number };

export type ReelScene = {
  durationInFrames: number;
  text: string;
  videoUrl: string | null;
  audioUrl: string | null;
  /** Tiempos relativos al inicio de la escena. */
  words: CaptionWord[];
};

export type ReelProps = {
  brand: {
    name: string;
    primary: string;
    secondary: string;
    fontFamily: string | null;
    logoUrl: string | null;
  };
  scenes: ReelScene[];
  cta: string;
};

export const totalFrames = (props: ReelProps) =>
  Math.max(1, props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0));
