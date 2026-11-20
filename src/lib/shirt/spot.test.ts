import { describe, expect, it } from 'vitest';
import {
  FRONT_PANEL,
  PREFERRED_SPOTS,
  SIGNATURE_EXCLUSION_PX,
  frontClickToPosition,
  overlapsSignature,
  percentToUv,
  positionOnFront,
  suggestFreeSpot,
  uvToPercent,
} from './spot';

describe('suggestFreeSpot', () => {
  it('starts at the centre of the chest when the shirt is empty', () => {
    expect(suggestFreeSpot([])).toEqual(PREFERRED_SPOTS[0]);
    const local = positionOnFront(PREFERRED_SPOTS[0]);
    expect(local).not.toBeNull();
    expect(local!.x).toBeGreaterThan(0.3);
    expect(local!.x).toBeLessThan(0.7);
  });

  it('skips a spot that is inside the signature exclusion radius', () => {
    const taken = PREFERRED_SPOTS[0];
    const next = suggestFreeSpot([taken]);
    expect(next).not.toEqual(taken);
    expect(overlapsSignature(next!, [taken])).toBe(false);
    expect(overlapsSignature({ x: taken.x + 2, y: taken.y }, [taken])).toBe(true);
  });

  it('keeps a signature that sits just outside the radius', () => {
    const centre = PREFERRED_SPOTS[0];
    // 150px on a 2048 texture is 7.324 percentage points. Step past that.
    const nearby = { x: centre.x + (SIGNATURE_EXCLUSION_PX / 2048) * 100 + 0.5, y: centre.y };
    expect(overlapsSignature(centre, [nearby])).toBe(false);
    expect(suggestFreeSpot([nearby])).toEqual(centre);
  });

  it('returns null when the front panel is full', () => {
    const blocked = [];
    for (let y = FRONT_PANEL.minY; y <= FRONT_PANEL.maxY; y += 2) {
      for (let x = FRONT_PANEL.minX; x <= FRONT_PANEL.maxX; x += 2) {
        blocked.push({ x, y });
      }
    }
    expect(suggestFreeSpot(blocked)).toBeNull();
  });

  it('ignores signatures that are missing coordinates', () => {
    const occupied = [PREFERRED_SPOTS[0], { x: Number.NaN, y: 10 }];
    expect(suggestFreeSpot(occupied)).toEqual(PREFERRED_SPOTS[1]);
  });
});

describe('shirt coordinates', () => {
  it('round-trips a UV through the stored x/y percentages', () => {
    const percent = uvToPercent({ x: 0.2535, y: 0.5319 });
    expect(percent).toEqual({ x: 25.35, y: 46.81 });
    const uv = percentToUv(percent);
    expect(uv.x).toBeCloseTo(0.2535, 4);
    expect(uv.y).toBeCloseTo(0.5319, 4);
  });

  it('maps the middle of the flat chest to the front panel', () => {
    const spot = frontClickToPosition(0.5, 0.5);
    expect(spot.x).toBeCloseTo((FRONT_PANEL.minX + FRONT_PANEL.maxX) / 2, 2);
    expect(spot.y).toBeCloseTo((FRONT_PANEL.minY + FRONT_PANEL.maxY) / 2, 2);
    expect(positionOnFront(spot)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('does not draw a sleeve signature on the flat chest', () => {
    expect(positionOnFront({ x: 5.62, y: 8.09 })).toBeNull();
  });
});
