import { Composition, registerRoot } from "remotion";
import { Reel } from "./Reel";
import { COMPOSITION_ID, FPS, HEIGHT, totalFrames, WIDTH, type ReelProps } from "./types";

const sampleProps: ReelProps = {
  brand: { name: "Café Luna", primary: "#e07a5f", secondary: "#f2cc8f", fontFamily: null, logoUrl: null },
  cta: "Comenta CAFÉ",
  scenes: [
    { durationInFrames: 75, text: "¿Tu café sabe amargo?", videoUrl: null, audioUrl: null, words: [] },
    { durationInFrames: 120, text: "El error está en el agua", videoUrl: null, audioUrl: null, words: [] },
  ],
};

function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={Reel}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={totalFrames(sampleProps)}
      defaultProps={sampleProps}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props) })}
    />
  );
}

registerRoot(Root);
