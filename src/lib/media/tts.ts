/** Voz en off con ElevenLabs (opcional: ELEVENLABS_API_KEY). Devuelve audio y tiempos por palabra. */

export type WordTiming = { word: string; start: number; end: number };
export type Speech = { audio: Buffer; durationSeconds: number; words: WordTiming[] };

export type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** Agrupa la alineación por caracteres en palabras con su inicio y fin. */
export function wordsFromAlignment(alignment: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current: WordTiming | null = null;
  alignment.characters.forEach((char, i) => {
    if (/\s/.test(char)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    const start = alignment.character_start_times_seconds[i];
    const end = alignment.character_end_times_seconds[i];
    if (current) {
      current.word += char;
      current.end = end;
    } else {
      current = { word: char, start, end };
    }
  });
  if (current) words.push(current);
  return words;
}

export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export async function synthesizeSpeech(text: string, opts: { apiKey: string; voiceId?: string }): Promise<Speech> {
  const voice = opts.voiceId || DEFAULT_VOICE_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": opts.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs respondió ${res.status}: ${await res.text().catch(() => "")}`);
  const body = (await res.json()) as { audio_base64: string; alignment: Alignment | null };
  const words = body.alignment ? wordsFromAlignment(body.alignment) : [];
  const durationSeconds = body.alignment?.character_end_times_seconds.at(-1) ?? 0;
  return { audio: Buffer.from(body.audio_base64, "base64"), durationSeconds, words };
}
