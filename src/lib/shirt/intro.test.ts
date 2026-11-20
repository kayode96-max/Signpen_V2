import { describe, expect, it } from 'vitest';
import { SHIRT_GROW_MS, SHIRT_GROW_SCALE, shirtIntroScale, shirtIntroSettled } from './intro';

describe('shirt intro', () => {
  it('skips the grow for a crossfade so the shirt is full size immediately', () => {
    expect(shirtIntroScale('none', 0)).toBe(SHIRT_GROW_SCALE);
    expect(shirtIntroSettled('none', 0)).toBe(true);
  });

  it('keeps the 1.5s grow for the initial load and settles only at the end', () => {
    expect(SHIRT_GROW_MS).toBe(1500);
    expect(shirtIntroScale('grow', 0)).toBe(0);
    expect(shirtIntroSettled('grow', 0)).toBe(false);
    expect(shirtIntroSettled('grow', SHIRT_GROW_MS - 1)).toBe(false);
    expect(shirtIntroScale('grow', SHIRT_GROW_MS)).toBe(SHIRT_GROW_SCALE);
    expect(shirtIntroSettled('grow', SHIRT_GROW_MS)).toBe(true);
  });
});
