/**
 * Pure history for signatures baked onto the shirt texture.
 *
 * Existing signatures (other people) and the current signer's in-progress
 * placements share one draw list so compositing stays a single pass, but
 * Undo / Clear may only touch `session` entries. Overlap uses every entry
 * that would remain on the shirt. A reposition does not remove the signer's
 * current mark unless the new spot is accepted.
 */

export type PlacementKind = 'existing' | 'session';

export interface PlacementPoint {
  x: number;
  y: number;
}

export interface ShirtPlacement<TImage> {
  kind: PlacementKind;
  canvas: TImage;
  uv: PlacementPoint;
  size: { width: number; height: number };
  area: PlacementPoint;
}

/** Shirt UV (origin bottom-left) → composite texture pixels (origin top-left). */
export function texturePointFromUv(
  uv: PlacementPoint,
  textureWidth: number,
  textureHeight: number
): PlacementPoint {
  return {
    x: uv.x * textureWidth,
    y: (1 - uv.y) * textureHeight,
  };
}

/** True when `point` is inside the open radius of any placement still on the shirt. */
export function overlapsPlacement(
  placements: ReadonlyArray<{ area: PlacementPoint }>,
  point: PlacementPoint,
  radius: number
): boolean {
  for (const placement of placements) {
    const distance = Math.hypot(point.x - placement.area.x, point.y - placement.area.y);
    if (distance < radius) return true;
  }
  return false;
}

/**
 * Drop the current signer's latest placement.
 * Returns the same array when there is nothing of theirs to remove.
 */
export function undoSessionPlacement<T extends { kind: PlacementKind }>(
  placements: T[]
): { placements: T[]; removed: boolean } {
  for (let i = placements.length - 1; i >= 0; i--) {
    if (placements[i].kind === 'session') {
      const next = placements.slice();
      next.splice(i, 1);
      return { placements: next, removed: true };
    }
  }
  return { placements, removed: false };
}

/**
 * Drop every placement the current signer added.
 * Returns the same array when they have not placed anything.
 */
export function clearSessionPlacements<T extends { kind: PlacementKind }>(
  placements: T[]
): { placements: T[]; removed: boolean } {
  let removed = false;
  const next: T[] = [];
  for (const placement of placements) {
    if (placement.kind === 'session') {
      removed = true;
      continue;
    }
    next.push(placement);
  }
  if (!removed) return { placements, removed: false };
  return { placements: next, removed: true };
}

/**
 * Set the current signer's in-progress placement.
 *
 * When they already have one, it replaces only that latest mark. The new spot
 * may overlap the mark being replaced (so a small nudge works) but not any
 * signature that stays. On rejection the same array is returned and the
 * previous placement is still in it.
 */
export function commitSessionPlacement<T extends { kind: PlacementKind; area: PlacementPoint }>(
  placements: T[],
  next: T,
  radius: number
): { placements: T[]; accepted: boolean } {
  let latestSessionIndex = -1;
  for (let i = placements.length - 1; i >= 0; i--) {
    if (placements[i].kind === 'session') {
      latestSessionIndex = i;
      break;
    }
  }

  const blocking = latestSessionIndex < 0
    ? placements
    : placements.filter((_, index) => index !== latestSessionIndex);
  if (overlapsPlacement(blocking, next.area, radius)) {
    return { placements, accepted: false };
  }

  const updated = placements.slice();
  if (latestSessionIndex >= 0) updated.splice(latestSessionIndex, 1);
  updated.push(next);
  return { placements: updated, accepted: true };
}
