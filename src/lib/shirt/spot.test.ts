import { describe, expect, it } from 'vitest';
import {
  FRONT_PANEL,
  MAX_SIGNATURE_OVERLAP,
  PREFERRED_SPOTS,
  frontClickToPosition,
  percentToUv,
  positionOnFront,
  signatureOverlapRatio,
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

  it('skips a spot that covers more than 20% of an existing signature', () => {
    const taken = PREFERRED_SPOTS[0];
    const next = suggestFreeSpot([taken]);
    expect(next).not.toEqual(taken);
    expect(signatureOverlapRatio(next, taken)).toBeLessThanOrEqual(MAX_SIGNATURE_OVERLAP);
    expect(signatureOverlapRatio({ x: taken.x + 2, y: taken.y }, taken)).toBeGreaterThan(MAX_SIGNATURE_OVERLAP);
  });

  it('keeps the centre when a neighbour only touches the footprint', () => {
    const centre = PREFERRED_SPOTS[0];
    const nearby = { x: centre.x + 16, y: centre.y };
    expect(signatureOverlapRatio(centre, nearby)).toBe(0);
    expect(suggestFreeSpot([nearby])).toEqual(centre);
  });

  it('picks the least crowded spot when the shirt is full and still returns one', () => {
    const blocked = [];
    for (let y = FRONT_PANEL.minY; y <= FRONT_PANEL.maxY; y += 2) {
      for (let x = FRONT_PANEL.minX; x <= FRONT_PANEL.maxX; x += 2) {
        blocked.push({ x, y });
      }
    }
    const spot = suggestFreeSpot(blocked);
    expect(spot.x).toBeGreaterThanOrEqual(FRONT_PANEL.minX);
    expect(spot.x).toBeLessThanOrEqual(FRONT_PANEL.maxX);
    const crowded = signatureOverlapRatio(PREFERRED_SPOTS[0], blocked[0]);
    expect(signatureOverlapRatio(spot, blocked[0])).toBeLessThanOrEqual(Math.max(crowded, 1));
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
