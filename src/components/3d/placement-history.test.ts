import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
    assert.equal(once.removed, true);
    assert.deepEqual(once.placements.map((item) => item.id), ['a', 'd', 'c']);

    const twice = undoSessionPlacement(once.placements);
    assert.equal(twice.removed, true);
    assert.deepEqual(twice.placements.map((item) => item.id), ['a', 'c']);

    const third = undoSessionPlacement(twice.placements);
    assert.equal(third.removed, false);
    assert.equal(third.placements, twice.placements);
  });

  it('does nothing when the signer has not placed anything', () => {
    const items = [existing('a', { x: 0, y: 0 })];
    const result = undoSessionPlacement(items);
    assert.equal(result.removed, false);
    assert.equal(result.placements, items);
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
    assert.equal(result.removed, true);
    assert.deepEqual(result.placements.map((item) => item.id), ['a', 'c']);
  });

  it('does nothing when every placement already belongs to someone else', () => {
    const items = [existing('a', { x: 1, y: 1 }), existing('c', { x: 3, y: 3 })];
    const result = clearSessionPlacements(items);
    assert.equal(result.removed, false);
    assert.equal(result.placements, items);
  });
});

describe('overlapsPlacement', () => {
  const radius = 150;

  it('blocks points inside the radius of a signature that survived clear', () => {
    const kept = clearSessionPlacements([
      existing('a', { x: 100, y: 200 }),
      session('mine', { x: 900, y: 900 }),
    ]);
    assert.equal(overlapsPlacement(kept.placements, { x: 100, y: 200 }, radius), true);
    assert.equal(overlapsPlacement(kept.placements, { x: 220, y: 200 }, radius), true);
    assert.equal(overlapsPlacement(kept.placements, { x: 250, y: 200 }, radius), false);
    assert.equal(overlapsPlacement(kept.placements, { x: 900, y: 900 }, radius), false);
  });

  it('treats a distance equal to the radius as free, matching a strict less-than check', () => {
    const placements = [existing('a', { x: 0, y: 0 })];
    assert.equal(overlapsPlacement(placements, { x: 3, y: 4 }, 5), false);
    assert.equal(overlapsPlacement(placements, { x: 3, y: 4 }, 5.01), true);
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
    assert.equal(result.accepted, false);
    assert.equal(result.placements, items);
  });

  it('keeps the previous signature when the new spot overlaps both marks', () => {
    const items = [
      existing('theirs', { x: 0, y: 0 }),
      session('mine', { x: 80, y: 0 }),
    ];
    const result = commitSessionPlacement(items, session('next', { x: 40, y: 0 }), radius);
    assert.equal(result.accepted, false);
    assert.equal(result.placements, items);
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
    assert.equal(result.accepted, true);
    assert.deepEqual(result.placements.map((item) => item.id), ['theirs', 'later', 'next']);
  });

  it('allows a move that overlaps only the signature being replaced', () => {
    const result = commitSessionPlacement(
      [session('mine', { x: 0, y: 0 })],
      session('next', { x: 100, y: 0 }),
      radius
    );
    assert.equal(result.accepted, true);
    assert.deepEqual(result.placements.map((item) => item.id), ['next']);
  });

  it('still blocks on an older session placement that is not replaced', () => {
    const items = [session('older', { x: 0, y: 0 }), session('latest', { x: 500, y: 0 })];
    const blocked = commitSessionPlacement(items, session('next', { x: 100, y: 0 }), radius);
    assert.equal(blocked.accepted, false);
    assert.equal(blocked.placements, items);

    const moved = commitSessionPlacement(items, session('next', { x: 500, y: 100 }), radius);
    assert.equal(moved.accepted, true);
    assert.deepEqual(moved.placements.map((item) => item.id), ['older', 'next']);
  });

  it('appends a first placement and rejects one that overlaps an existing signature', () => {
    const items = [existing('theirs', { x: 0, y: 0 })];
    const rejected = commitSessionPlacement(items, session('next', { x: 10, y: 0 }), radius);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.placements, items);

    const placed = commitSessionPlacement(items, session('next', { x: 400, y: 0 }), radius);
    assert.equal(placed.accepted, true);
    assert.deepEqual(placed.placements.map((item) => item.id), ['theirs', 'next']);
  });
});

describe('texturePointFromUv', () => {
  it('flips V so texture rows grow downward', () => {
    assert.deepEqual(texturePointFromUv({ x: 0.25, y: 0.5 }, 2048, 2048), {
      x: 512,
      y: 1024,
    });
  });
});
