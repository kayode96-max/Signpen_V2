import { describe, expect, it } from 'vitest';
import {
  FIRST_VIEW_BYTE_BUDGET,
  FIRST_VIEW_REQUEST_BYTE_BUDGET,
  budgetFailures,
  budgetsAreEnforced,
  isLazyFirstViewAsset,
  summarizeFirstView,
} from './first-view-budget';

describe('isLazyFirstViewAsset', () => {
  it('treats the hero video, scene.bin, and three.js chunks as report-only', () => {
    expect(isLazyFirstViewAsset('http://127.0.0.1:3210/images/vid1.mp4')).toBe(true);
    expect(isLazyFirstViewAsset('http://127.0.0.1:3210/images/vid1.d685294af0.mp4')).toBe(true);
    expect(isLazyFirstViewAsset('http://127.0.0.1:3210/model/scene.bin')).toBe(true);
    expect(isLazyFirstViewAsset('http://127.0.0.1:3210/_next/static/chunks/three-abc123.js')).toBe(true);
  });

  it('keeps ordinary first-view files on the gate', () => {
    expect(isLazyFirstViewAsset('http://127.0.0.1:3210/images/signpen.png')).toBe(false);
    expect(isLazyFirstViewAsset('http://127.0.0.1:3210/_next/static/chunks/app.js')).toBe(false);
  });
});

describe('summarizeFirstView', () => {
  it('excludes lazy bytes from the failing totals and keeps them in the report', () => {
    const summary = summarizeFirstView([
      { url: 'http://127.0.0.1:3210/', bytes: 20_000 },
      { url: 'http://127.0.0.1:3210/images/vid1.mp4', bytes: 2_500_000 },
      { url: 'http://127.0.0.1:3210/model/scene.bin', bytes: 4_500_000 },
      { url: 'http://127.0.0.1:3210/_next/static/chunks/three.core.js', bytes: 800_000 },
    ]);

    expect(summary.lazyBytes).toBe(2_500_000 + 4_500_000 + 800_000);
    expect(summary.firstViewBytes).toBe(summary.gatedFirstViewBytes + summary.lazyBytes);
    expect(summary.gatedFirstViewBytes).toBe(20_000);
    expect(budgetFailures(summary)).toEqual([]);
  });

  it('fails when gated first-view bytes exceed 1 MB', () => {
    const summary = summarizeFirstView([
      { url: 'http://127.0.0.1:3210/images/signpen.png', bytes: FIRST_VIEW_BYTE_BUDGET + 1 },
    ]);
    expect(budgetFailures(summary).some((line) => line.includes('gated first-view bytes'))).toBe(true);
  });

  it('flags signpen.png and interactive.svg on the current landing page', () => {
    const summary = summarizeFirstView([
      { url: 'http://127.0.0.1:3210/images/interactive.svg', bytes: 2_900_000 },
      { url: 'http://127.0.0.1:3210/images/signpen.png', bytes: 1_100_000 },
      { url: 'http://127.0.0.1:3210/images/vid1.mp4', bytes: 2_500_000 },
    ]);
    const failures = budgetFailures(summary);
    expect(summary.gatedFirstViewBytes).toBe(4_000_000);
    expect(summary.gatedFirstViewBytes).toBeGreaterThan(FIRST_VIEW_BYTE_BUDGET);
    expect(failures.some((line) => line.includes('gated first-view bytes'))).toBe(true);
    expect(failures.some((line) => line.includes('interactive.svg'))).toBe(true);
    expect(failures.some((line) => line.includes('signpen.png'))).toBe(true);
    expect(failures.some((line) => line.includes('vid1.mp4'))).toBe(false);
    expect(summary.oversizedGatedRequests.map((request) => request.url)).toEqual([
      'http://127.0.0.1:3210/images/interactive.svg',
      'http://127.0.0.1:3210/images/signpen.png',
    ]);
  });

  it('fails when one gated request exceeds 300 KB and ignores a larger lazy file', () => {
    const summary = summarizeFirstView([
      { url: 'http://127.0.0.1:3210/images/interactive.svg', bytes: FIRST_VIEW_REQUEST_BYTE_BUDGET + 1 },
      { url: 'http://127.0.0.1:3210/images/vid1.mp4', bytes: 5_000_000 },
    ]);
    const failures = budgetFailures(summary);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('interactive.svg');
    expect(failures[0]).not.toContain('vid1.mp4');
  });

  it('groups repeated URLs and ignores a hash', () => {
    const summary = summarizeFirstView([
      { url: 'http://127.0.0.1:3210/app.js#part', bytes: 100 },
      { url: 'http://127.0.0.1:3210/app.js', bytes: 50 },
    ]);
    expect(summary.resources).toEqual([
      { url: 'http://127.0.0.1:3210/app.js', bytes: 150, lazy: false },
    ]);
  });
});

describe('budgetsAreEnforced', () => {
  it('is on only for the string 1', () => {
    expect(budgetsAreEnforced('1')).toBe(true);
    expect(budgetsAreEnforced('0')).toBe(false);
    expect(budgetsAreEnforced(undefined)).toBe(false);
    expect(budgetsAreEnforced('true')).toBe(false);
  });
});
