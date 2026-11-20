/** Entrance scale for the 3D shirt. Crossfades skip the grow so they land on a finished model. */

export const SHIRT_GROW_MS = 1500;
export const SHIRT_GROW_SCALE = 2.5;

export type ShirtIntro = 'grow' | 'none';

export function shirtIntroScale(intro: ShirtIntro, elapsedMs: number): number {
  if (intro === 'none') return SHIRT_GROW_SCALE;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const t = Math.min(elapsed / SHIRT_GROW_MS, 1);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return SHIRT_GROW_SCALE * eased;
}

/** Ignore a hidden or empty box so a later real size can resize the canvas. */
export function canvasDrawSize(width: number, height: number): { width: number; height: number } | null {
  if (!(width >= 2) || !(height >= 2)) return null;
  return { width, height };
}

/** Grow reports ready only after 1.5s. A crossfade is ready at full size immediately. */
export function shirtIntroSettled(intro: ShirtIntro, elapsedMs: number): boolean {
  if (intro === 'none') return true;
  return (Number.isFinite(elapsedMs) ? elapsedMs : 0) >= SHIRT_GROW_MS;
}
