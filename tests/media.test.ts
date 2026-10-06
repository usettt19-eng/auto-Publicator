import { describe, expect, it } from "vitest";
import { pickVerticalFile, type PexelsVideo } from "@/lib/media/pexels";
import { wordsFromAlignment } from "@/lib/media/tts";
import { readableTextOn } from "@/remotion/colors";

describe("pickVerticalFile", () => {
  const video = (files: PexelsVideo["video_files"]): PexelsVideo => ({ id: 1, duration: 10, url: "", video_files: files });
  it("elige el MP4 vertical más cercano a 1920 sin pasarse", () => {
    const file = pickVerticalFile(
      video([
        { link: "h", width: 1920, height: 1080, file_type: "video/mp4" },
        { link: "4k", width: 2160, height: 3840, file_type: "video/mp4" },
        { link: "hd", width: 1080, height: 1920, file_type: "video/mp4" },
        { link: "sd", width: 540, height: 960, file_type: "video/mp4" },
      ]),
    );
    expect(file?.link).toBe("hd");
  });
  it("devuelve null si no hay vertical", () => {
    expect(pickVerticalFile(video([{ link: "h", width: 1920, height: 1080, file_type: "video/mp4" }]))).toBeNull();
  });
});

describe("wordsFromAlignment", () => {
  it("agrupa caracteres en palabras", () => {
    const chars = [..."Hola mundo"];
    const words = wordsFromAlignment({
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => i * 0.1),
      character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1),
    });
    expect(words.map((w) => w.word)).toEqual(["Hola", "mundo"]);
    expect(words[0].start).toBe(0);
    expect(words[1].end).toBeCloseTo(1.0);
  });
});

describe("readableTextOn", () => {
  it("elige texto claro u oscuro según el fondo", () => {
    expect(readableTextOn("#1c1917")).toBe("#ffffff");
    expect(readableTextOn("#f2cc8f")).toBe("#111111");
  });
});
