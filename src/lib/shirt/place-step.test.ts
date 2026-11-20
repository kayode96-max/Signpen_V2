import { describe, expect, it } from 'vitest';
import { placeShirtOnEntry, placeShirtWhileOpen } from './place-step';

describe('place step shirt lock', () => {
  it('opens on the 3D shirt only when that model has already settled', () => {
    expect(placeShirtOnEntry(true)).toBe('3d');
    expect(placeShirtOnEntry(false)).toBe('flat');
  });

  it('does not swap mid-step when the model becomes ready after entry', () => {
    expect(placeShirtWhileOpen('flat')).toBe('flat');
    expect(placeShirtWhileOpen('3d')).toBe('3d');
  });
});
