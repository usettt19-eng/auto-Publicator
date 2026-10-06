/** Error que no se arregla reintentando: el reel pasa directamente a `failed`. */
export class PermanentJobError extends Error {}

/** Aplaza el trabajo sin gastar un intento (p. ej. límite diario de publicaciones alcanzado). */
export class DeferJobError extends Error {
  constructor(
    message: string,
    readonly delaySeconds: number,
  ) {
    super(message);
  }
}
