/** Partes de fecha/hora de un instante en una zona horaria IANA. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Convierte una hora local (en `timeZone`) a un instante UTC. */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute?: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute ?? 0);
  // Offset de la zona en ese instante; se itera dos veces para cubrir cambios de horario.
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    utc = guess - (asUtc - utc);
  }
  return new Date(utc);
}

/** Clave de día local "YYYY-MM-DD" de un instante. */
export function localDayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Siguiente hueco libre: el primer día (desde mañana) sin otro reel programado,
 * a la hora de publicación del workspace.
 */
export function suggestNextSlot(opts: {
  now?: Date;
  timeZone: string;
  postingHour: number;
  taken: (string | Date)[];
  maxDays?: number;
}): Date {
  const now = opts.now ?? new Date();
  const takenDays = new Set(opts.taken.map((t) => localDayKey(new Date(t), opts.timeZone)));
  const today = zonedParts(now, opts.timeZone);

  for (let offset = 1; offset <= (opts.maxDays ?? 60); offset++) {
    // Date.UTC normaliza desbordes de día/mes.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const slot = zonedTimeToUtc(
      { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour: opts.postingHour },
      opts.timeZone,
    );
    if (!takenDays.has(localDayKey(slot, opts.timeZone))) return slot;
  }
  throw new Error("No hay huecos libres en el periodo indicado");
}

/** Reparte `count` fechas (YYYY-MM-DD) a lo largo de los próximos `days` días, empezando mañana. */
export function spreadDates(count: number, days: number, from: Date, timeZone: string): string[] {
  const today = zonedParts(from, timeZone);
  const step = days / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + 1 + Math.floor(i * step)));
    return d.toISOString().slice(0, 10);
  });
}
