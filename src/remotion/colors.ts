/** Luminancia relativa WCAG de un color hex #rrggbb. */
export function luminance(hex: string): number {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Texto blanco o casi negro según qué contraste más con el fondo. */
export function readableTextOn(hex: string): string {
  const l = luminance(hex);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastDark = (l + 0.05) / 0.05;
  return contrastWhite >= contrastDark ? "#ffffff" : "#111111";
}

/** Mezcla un hex con negro (amount 0-1) para fondos oscuros a partir de la marca. */
export function darken(hex: string, amount: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `#${m
    .slice(1)
    .map((c) => Math.round(parseInt(c, 16) * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`;
}
