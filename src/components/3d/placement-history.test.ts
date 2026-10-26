import { describe, expect, it } from 'vitest';
import {
  clearSessionPlacements,
  commitSessionPlacement,
  overlapsPlacement,
  texturePointFromUv,
  undoSessionPlacement,
  type PlacementKind,
  type PlacementPoint,
} from './placement-history';

interface Mark {
  kind: PlacementKind;
  id: string;
  area: PlacementPoint;
}

const existing = (id: string, area: PlacementPoint): Mark => ({ kind: 'existing', id, area });
const session = (id: string, area: PlacementPoint): Mark => ({ kind: 'session', id, area });

describe('undoSessionPlacement', () => {
  it('removes only the latest session placement and leaves existing signatures', () => {
    const first = existing('a', { x: 10, y: 10 });
    const mine = session('b', { x: 40, y: 40 });
    const later = existing('c', { x: 80, y: 80 });
    const olderMine = session('d', { x: 20, y: 90 });

    const once = undoSessionPlacement([first, olderMine, mine, later]);
    expect(once.removed).toBe(true);
    expect(once.placements.map((item) => item.id)).toEqual(['a', 'd', 'c']);

    const twice = undoSessionPlacement(once.placements);
    expect(twice.removed).toBe(true);
    expect(twice.placements.map((item) => item.id)).toEqual(['a', 'c']);

    const third = undoSessionPlacement(twice.placements);
    expect(third.removed).toBe(false);
    expect(third.placements).toBe(twice.placements);
  });

  it('does nothing when the signer has not placed anything', () => {
    const items = [existing('a', { x: 0, y: 0 })];
    const result = undoSessionPlacement(items);
    expect(result.removed).toBe(false);
    expect(result.placements).toBe(items);
  });
});

describe('clearSessionPlacements', () => {
  it('removes every session placement and keeps existing ones in order', () => {
    const items = [
      existing('a', { x: 1, y: 1 }),
      session('b', { x: 2, y: 2 }),
      existing('c', { x: 3, y: 3 }),
      session('d', { x: 4, y: 4 }),
    ];
    const result = clearSessionPlacements(items);
    expect(result.removed).toBe(true);
    expect(result.placements.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('does nothing when every placement already belongs to someone else', () => {
    const items = [existing('a', { x: 1, y: 1 }), existing('c', { x: 3, y: 3 })];
    const result = clearSessionPlacements(items);
    expect(result.removed).toBe(false);
    expect(result.placements).toBe(items);
  });
});

describe('overlapsPlacement', () => {
  const radius = 150;

  it('blocks points inside the radius of a signature that survived clear', () => {
    const kept = clearSessionPlacements([
      existing('a', { x: 100, y: 200 }),
      session('mine', { x: 900, y: 900 }),
    ]);
    expect(overlapsPlacement(kept.placements, { x: 100, y: 200 }, radius)).toBe(true);
    expect(overlapsPlacement(kept.placements, { x: 220, y: 200 }, radius)).toBe(true);
    expect(overlapsPlacement(kept.placements, { x: 250, y: 200 }, radius)).toBe(false);
    expect(overlapsPlacement(kept.placements, { x: 900, y: 900 }, radius)).toBe(false);
  });

  it('treats a distance equal to the radius as free, matching a strict less-than check', () => {
    const placements = [existing('a', { x: 0, y: 0 })];
    expect(overlapsPlacement(placements, { x: 3, y: 4 }, 5)).toBe(false);
    expect(overlapsPlacement(placements, { x: 3, y: 4 }, 5.01)).toBe(true);
  });
});

describe('commitSessionPlacement', () => {
  const radius = 150;

  it('keeps the previous signature when the new spot overlaps someone else', () => {
    const items = [
      existing('theirs', { x: 0, y: 0 }),
      session('mine', { x: 400, y: 400 }),
    ];
    const result = commitSessionPlacement(items, session('next', { x: 100, y: 0 }), radius);
    expect(result.accepted).toBe(false);
    expect(result.placements).toBe(items);
  });

  it('keeps the previous signature when the new spot overlaps both marks', () => {
    const items = [
      existing('theirs', { x: 0, y: 0 }),
      session('mine', { x: 80, y: 0 }),
    ];
    const result = commitSessionPlacement(items, session('next', { x: 40, y: 0 }), radius);
    expect(result.accepted).toBe(false);
    expect(result.placements).toBe(items);
  });

  it('replaces only the latest session placement when the new spot is free', () => {
    const result = commitSessionPlacement(
      [
        existing('theirs', { x: 0, y: 0 }),
        session('mine', { x: 400, y: 0 }),
        existing('later', { x: 0, y: 400 }),
      ],
      session('next', { x: 400, y: 200 }),
      radius
    );
    expect(result.accepted).toBe(true);
    expect(result.placements.map((item) => item.id)).toEqual(['theirs', 'later', 'next']);
  });

  it('allows a move that overlaps only the signature being replaced', () => {
    const result = commitSessionPlacement(
      [session('mine', { x: 0, y: 0 })],
      session('next', { x: 100, y: 0 }),
      radius
    );
    expect(result.accepted).toBe(true);
    expect(result.placements.map((item) => item.id)).toEqual(['next']);
  });

  it('still blocks on an older session placement that is not replaced', () => {
    const items = [session('older', { x: 0, y: 0 }), session('latest', { x: 500, y: 0 })];
    const blocked = commitSessionPlacement(items, session('next', { x: 100, y: 0 }), radius);
    expect(blocked.accepted).toBe(false);
    expect(blocked.placements).toBe(items);

    const moved = commitSessionPlacement(items, session('next', { x: 500, y: 100 }), radius);
    expect(moved.accepted).toBe(true);
    expect(moved.placements.map((item) => item.id)).toEqual(['older', 'next']);
  });

  it('appends a first placement and rejects one that overlaps an existing signature', () => {
    const items = [existing('theirs', { x: 0, y: 0 })];
    const rejected = commitSessionPlacement(items, session('next', { x: 10, y: 0 }), radius);
    expect(rejected.accepted).toBe(false);
    expect(rejected.placements).toBe(items);

    const placed = commitSessionPlacement(items, session('next', { x: 400, y: 0 }), radius);
    expect(placed.accepted).toBe(true);
    expect(placed.placements.map((item) => item.id)).toEqual(['theirs', 'next']);
  });
});

describe('texturePointFromUv', () => {
  it('flips V so texture rows grow downward', () => {
    expect(texturePointFromUv({ x: 0.25, y: 0.5 }, 2048, 2048)).toEqual({
      x: 512,
      y: 1024,
    });
  });
});
