"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import type { HourStat } from "@/lib/reels/best-hours";
import { saveSettings } from "./actions";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function SettingsForm({
  timezone,
  postingHour,
  bestHours,
  bestHoursError,
  zones,
}: {
  zones: string[];
  timezone: string;
  postingHour: number;
  bestHours: HourStat[] | null;
  bestHoursError: string | null;
}) {
  const [tz, setTz] = useState(timezone);
  const [hour, setHour] = useState(postingHour);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await saveSettings({ timezone: tz, postingHour: hour });
      setMessage(result.ok ? { ok: true, text: "Guardado" } : { ok: false, text: result.error });
    });

  return (
    <div className="flex flex-col gap-6">
      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Publicación</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Zona horaria</span>
          <select className="rounded-lg border border-border bg-background px-3 py-2" value={tz} onChange={(e) => setTz(e.target.value)}>
            {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hora de publicación por defecto</span>
          <select className="rounded-lg border border-border bg-background px-3 py-2" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">Se usa al aprobar un reel sin elegir fecha: un reel al día como máximo.</span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {message && <span className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Mejores horas según tu Instagram</h2>
        <p className="mb-4 text-sm text-muted">Engagement medio (likes + comentarios) de tus últimas publicaciones, por hora en tu zona horaria.</p>
        {bestHoursError && <p className="text-sm text-muted">{bestHoursError}</p>}
        {bestHours && bestHours.length === 0 && <p className="text-sm text-muted">Aún no hay suficientes publicaciones.</p>}
        {bestHours && bestHours.length > 0 && (
          <ul className="flex flex-col gap-2">
            {bestHours.map((h) => (
              <li key={h.hour} className="flex items-center gap-3 text-sm">
                <span className="w-14 font-mono font-medium">{pad(h.hour)}</span>
                <span className="text-muted">
                  {h.avgEngagement} interacciones de media · {h.posts} {h.posts === 1 ? "publicación" : "publicaciones"}
                </span>
                {h.hour !== hour && (
                  <button type="button" className="ml-auto text-accent hover:underline" onClick={() => setHour(h.hour)}>
                    Usar esta hora
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
