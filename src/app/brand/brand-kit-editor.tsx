"use client";

import { useState, useTransition } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import type { BrandKit } from "@/lib/brand-kit/schema";
import { saveBrandKit } from "./actions";

const toLines = (items: string[]) => items.join("\n");
const fromLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  // Se guarda el texto crudo para no perder líneas vacías mientras se escribe.
  const [text, setText] = useState(toLines(value));
  return (
    <Field label={`${label} (una por línea)`}>
      <textarea
        className={`${inputClass} min-h-24`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(fromLines(e.target.value));
        }}
      />
    </Field>
  );
}

function ColorList({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((color, i) => (
          <span key={i} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <input
              type="color"
              value={color}
              onChange={(e) => onChange(value.map((c, j) => (j === i ? e.target.value : c)))}
              className="h-6 w-6 cursor-pointer bg-transparent"
            />
            <code className="text-xs">{color}</code>
            <button type="button" className="text-muted" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
        <button type="button" className="text-sm text-accent" onClick={() => onChange([...value, "#888888"])}>
          + color
        </button>
      </div>
    </Field>
  );
}

export function BrandKitEditor({ initialKit }: { initialKit: BrandKit }) {
  const [kit, setKit] = useState(initialKit);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => setKit((k) => ({ ...k, [key]: value }));
  const setVoice = (patch: Partial<BrandKit["voice"]>) => set("voice", { ...kit.voice, ...patch });
  const setVisual = (patch: Partial<BrandKit["visual_identity"]>) =>
    set("visual_identity", { ...kit.visual_identity, ...patch });
  const setAudience = (patch: Partial<BrandKit["target_audience"]>) =>
    set("target_audience", { ...kit.target_audience, ...patch });

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveBrandKit(kit);
      setMessage(result.ok ? { ok: true, text: "Guardado" } : { ok: false, text: result.error });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Identidad</h2>
        <Field label="Nombre de la marca">
          <input className={inputClass} value={kit.brand_name} onChange={(e) => set("brand_name", e.target.value)} />
        </Field>
        <Field label="Nicho">
          <input className={inputClass} value={kit.niche} onChange={(e) => set("niche", e.target.value)} />
        </Field>
        <Field label="En una frase">
          <input className={inputClass} value={kit.one_liner} onChange={(e) => set("one_liner", e.target.value)} />
        </Field>
        <Field label="Idioma (ISO)">
          <input className={inputClass} value={kit.language} onChange={(e) => set("language", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Propuesta de valor">
            <textarea
              className={`${inputClass} min-h-20`}
              value={kit.value_proposition}
              onChange={(e) => set("value_proposition", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Público objetivo</h2>
        <div className="sm:col-span-2">
          <Field label="Descripción">
            <textarea
              className={`${inputClass} min-h-20`}
              value={kit.target_audience.description}
              onChange={(e) => setAudience({ description: e.target.value })}
            />
          </Field>
        </div>
        <ListField label="Dolores" value={kit.target_audience.pain_points} onChange={(v) => setAudience({ pain_points: v })} />
        <ListField label="Deseos" value={kit.target_audience.desires} onChange={(v) => setAudience({ desires: v })} />
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Voz y tono</h2>
        <ListField label="Tono" value={kit.voice.tone} onChange={(v) => setVoice({ tone: v })} />
        <Field label="Descripción de la voz">
          <textarea
            className={`${inputClass} min-h-24`}
            value={kit.voice.description}
            onChange={(e) => setVoice({ description: e.target.value })}
          />
        </Field>
        <ListField label="Sí hacer" value={kit.voice.do} onChange={(v) => setVoice({ do: v })} />
        <ListField label="No hacer" value={kit.voice.dont} onChange={(v) => setVoice({ dont: v })} />
        <ListField label="Frases de ejemplo" value={kit.voice.sample_phrases} onChange={(v) => setVoice({ sample_phrases: v })} />
        <ListField label="Palabras prohibidas" value={kit.banned_words} onChange={(v) => set("banned_words", v)} />
        <ListField label="CTAs preferidos" value={kit.preferred_ctas} onChange={(v) => set("preferred_ctas", v)} />
        <ListField label="Hashtags" value={kit.hashtags} onChange={(v) => set("hashtags", v)} />
      </Card>

      <Card className="grid gap-4">
        <h2 className="font-semibold">Identidad visual</h2>
        <ColorList label="Colores primarios" value={kit.visual_identity.primary_colors} onChange={(v) => setVisual({ primary_colors: v })} />
        <ColorList
          label="Colores secundarios"
          value={kit.visual_identity.secondary_colors}
          onChange={(v) => setVisual({ secondary_colors: v })}
        />
        <ListField label="Tipografías" value={kit.visual_identity.fonts} onChange={(v) => setVisual({ fonts: v })} />
        <Field label="URL del logo">
          <input
            className={inputClass}
            value={kit.visual_identity.logo_url ?? ""}
            onChange={(e) => setVisual({ logo_url: e.target.value || null })}
          />
        </Field>
        <Field label="Notas de estilo">
          <textarea
            className={`${inputClass} min-h-20`}
            value={kit.visual_identity.style_notes}
            onChange={(e) => setVisual({ style_notes: e.target.value })}
          />
        </Field>
      </Card>

      <Card className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pilares de contenido</h2>
          <button
            type="button"
            className="text-sm text-accent"
            onClick={() => set("content_pillars", [...kit.content_pillars, { name: "", description: "", example_topics: [] }])}
          >
            + pilar
          </button>
        </div>
        {kit.content_pillars.map((pillar, i) => {
          const update = (patch: Partial<typeof pillar>) =>
            set(
              "content_pillars",
              kit.content_pillars.map((p, j) => (j === i ? { ...p, ...patch } : p)),
            );
          return (
            <div key={i} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
              <Field label="Nombre">
                <input className={inputClass} value={pillar.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Descripción">
                <input className={inputClass} value={pillar.description} onChange={(e) => update({ description: e.target.value })} />
              </Field>
              <ListField label="Temas de ejemplo" value={pillar.example_topics} onChange={(v) => update({ example_topics: v })} />
              <button
                type="button"
                className="self-end justify-self-end text-sm text-red-600"
                onClick={() => set("content_pillars", kit.content_pillars.filter((_, j) => j !== i))}
              >
                Eliminar pilar
              </button>
            </div>
          );
        })}
      </Card>

      {kit.instagram_insights && (
        <Card>
          <h2 className="mb-2 font-semibold">Lo que funciona en tu Instagram</h2>
          <p className="whitespace-pre-line text-sm text-muted">{kit.instagram_insights}</p>
        </Card>
      )}

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
        <Button onClick={save} disabled={pending}>
          {pending ? "Guardando..." : "Guardar Brand Kit"}
        </Button>
      </div>
    </div>
  );
}
