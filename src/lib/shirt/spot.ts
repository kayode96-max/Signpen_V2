/**
 * Free-spot picker for the front of the shirt.
 *
 * Positions are the same percentages the API stores:
 * x = uv.x * 100, y = (1 - uv.y) * 100.
 * The front panel was measured by raycasting the default camera at the
 * exterior mesh (Object_4). Exclusion matches TShirtCanvas SIG_RADIUS.
 */

export const SHIRT_TEXTURE_SIZE = 2048;
export const SIGNATURE_EXCLUSION_PX = 150;
/** The mark baked onto the shirt. Spacing uses this footprint, not a fixed radius. */
export const SIGNATURE_FOOTPRINT_PX = { width: 320, height: 140 };
/** A new auto spot may cover at most this fraction of an existing signature's area. */
export const MAX_SIGNATURE_OVERLAP = 0.2;

/** Camera-facing torso, in stored position percentages. */
export const FRONT_PANEL = {
  minX: 12,
  maxX: 40,
  minY: 33,
  maxY: 62,
} as const;

export type ShirtPoint = { x: number; y: number };

/** Centre of the chest first, then nearby front-panel spots. */
export const PREFERRED_SPOTS: readonly ShirtPoint[] = [
  { x: 25.35, y: 46.81 },
  { x: 16.5, y: 40 },
  { x: 34.5, y: 40 },
  { x: 16.5, y: 55 },
  { x: 34.5, y: 55 },
  { x: 25.35, y: 36 },
  { x: 25.35, y: 56 },
  { x: 20, y: 48 },
  { x: 31, y: 48 },
];

export function percentToUv(position: ShirtPoint): ShirtPoint {
  return {
    x: clamp01(position.x / 100),
    y: clamp01(1 - position.y / 100),
  };
}

export function uvToPercent(uv: ShirtPoint): ShirtPoint {
  return {
    x: round2(clamp01(uv.x) * 100),
    y: round2(clamp01(1 - uv.y) * 100),
  };
}

export function placementDistancePx(
  a: ShirtPoint,
  b: ShirtPoint,
  textureSize = SHIRT_TEXTURE_SIZE,
): number {
  const dx = ((a.x - b.x) / 100) * textureSize;
  const dy = ((a.y - b.y) / 100) * textureSize;
  return Math.hypot(dx, dy);
}

export function signatureFootprintPercent(textureSize = SHIRT_TEXTURE_SIZE): { width: number; height: number } {
  return {
    width: (SIGNATURE_FOOTPRINT_PX.width / textureSize) * 100,
    height: (SIGNATURE_FOOTPRINT_PX.height / textureSize) * 100,
  };
}

/** Share of one signature's area covered by the other, 0 when they only touch. */
export function signatureOverlapRatio(
  a: ShirtPoint,
  b: ShirtPoint,
  footprint = signatureFootprintPercent(),
): number {
  const area = footprint.width * footprint.height;
  if (!(area > 0)) return 0;
  const overlapWidth = Math.max(0, footprint.width - Math.abs(a.x - b.x));
  const overlapHeight = Math.max(0, footprint.height - Math.abs(a.y - b.y));
  return (overlapWidth * overlapHeight) / area;
}

function worstOverlap(
  spot: ShirtPoint,
  occupied: readonly ShirtPoint[],
  footprint: { width: number; height: number },
): number {
  let worst = 0;
  for (const other of occupied) {
    worst = Math.max(worst, signatureOverlapRatio(spot, other, footprint));
  }
  return worst;
}

export function overlapsSignature(
  point: ShirtPoint,
  occupied: readonly ShirtPoint[],
  radiusPx = SIGNATURE_EXCLUSION_PX,
  textureSize = SHIRT_TEXTURE_SIZE,
): boolean {
  for (const other of occupied) {
    if (placementDistancePx(point, other, textureSize) < radiusPx) return true;
  }
  return false;
}

export function clearancePx(
  point: ShirtPoint,
  occupied: readonly ShirtPoint[],
  textureSize = SHIRT_TEXTURE_SIZE,
): number {
  if (occupied.length === 0) return Number.POSITIVE_INFINITY;
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of occupied) {
    nearest = Math.min(nearest, placementDistancePx(point, other, textureSize));
  }
  return nearest;
}

/**
 * A spot on the front. Prefers one that covers at most 20% of any existing
 * signature. If the shirt is full, returns the least crowded candidate.
 * Always returns a point so signing is never blocked.
 */
export function suggestFreeSpot(
  occupied: readonly ShirtPoint[],
  options?: {
    preferred?: readonly ShirtPoint[];
    textureSize?: number;
    maxOverlap?: number;
  },
): ShirtPoint {
  const textureSize = options?.textureSize ?? SHIRT_TEXTURE_SIZE;
  const maxOverlap = options?.maxOverlap ?? MAX_SIGNATURE_OVERLAP;
  const preferred = options?.preferred ?? PREFERRED_SPOTS;
  const valid = occupied.filter(isPoint);
  const footprint = signatureFootprintPercent(textureSize);
  const candidates: ShirtPoint[] = preferred.map((spot) => ({ ...spot }));
  const step = Math.max(footprint.width * (1 - maxOverlap), 4);
  for (let y = FRONT_PANEL.minY; y <= FRONT_PANEL.maxY; y += step) {
    for (let x = FRONT_PANEL.minX; x <= FRONT_PANEL.maxX; x += step) {
      candidates.push({ x: round2(x), y: round2(y) });
    }
  }

  for (const spot of candidates) {
    if (worstOverlap(spot, valid, footprint) <= maxOverlap) return { ...spot };
  }

  let least = candidates[0] ?? { ...PREFERRED_SPOTS[0] };
  let leastOverlap = Number.POSITIVE_INFINITY;
  for (const spot of candidates) {
    const overlap = worstOverlap(spot, valid, footprint);
    if (overlap < leastOverlap) {
      least = spot;
      leastOverlap = overlap;
    }
  }
  return { ...least };
}

/** Map a 0–1 click on the flat shirt's chest onto a stored position. */
export function frontClickToPosition(localX: number, localY: number): ShirtPoint {
  const x = FRONT_PANEL.minX + clamp01(localX) * (FRONT_PANEL.maxX - FRONT_PANEL.minX);
  const y = FRONT_PANEL.minY + clamp01(localY) * (FRONT_PANEL.maxY - FRONT_PANEL.minY);
  return { x: round2(x), y: round2(y) };
}

/**
 * Where a stored position sits inside the flat shirt's chest, or null when
 * it lands on a sleeve, the back, or off the front panel.
 */
export function positionOnFront(position: ShirtPoint): ShirtPoint | null {
  if (!isPoint(position)) return null;
  const { minX, maxX, minY, maxY } = FRONT_PANEL;
  if (position.x < minX || position.x > maxX || position.y < minY || position.y > maxY) return null;
  return {
    x: (position.x - minX) / (maxX - minX),
    y: (position.y - minY) / (maxY - minY),
  };
}

function isPoint(value: ShirtPoint | null | undefined): value is ShirtPoint {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
