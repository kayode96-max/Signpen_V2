import { describe, expect, it } from 'vitest';
import { downloadProgressPercent, formatByteSize, formatDownloadLabel, readResponseBytes } from './bytes';

describe('downloadProgressPercent', () => {
  it('returns null until the total size is known', () => {
    expect(downloadProgressPercent(100, null)).toBeNull();
    expect(downloadProgressPercent(100, undefined)).toBeNull();
    expect(downloadProgressPercent(100, 0)).toBeNull();
    expect(downloadProgressPercent(100, Number.NaN)).toBeNull();
  });

  it('clamps to 0–100 and rounds', () => {
    expect(downloadProgressPercent(0, 1000)).toBe(0);
    expect(downloadProgressPercent(-5, 1000)).toBe(0);
    expect(downloadProgressPercent(250, 1000)).toBe(25);
    expect(downloadProgressPercent(1, 3)).toBe(33);
    expect(downloadProgressPercent(1500, 1000)).toBe(100);
  });
});

describe('formatDownloadLabel', () => {
  it('includes the percent and both sizes when Content-Length is known', () => {
    expect(formatDownloadLabel(256 * 1024, 512 * 1024)).toBe('Downloading the shirt… 50% (256 KB of 512 KB)');
  });

  it('omits the percent when the total is unknown', () => {
    expect(formatDownloadLabel(2048, null)).toBe('Downloading the shirt… 2 KB');
  });
});

describe('formatByteSize', () => {
  it('uses KB under a megabyte and MB above', () => {
    expect(formatByteSize(0)).toBe('0 KB');
    expect(formatByteSize(500)).toBe('500 B');
    expect(formatByteSize(4096)).toBe('4 KB');
    expect(formatByteSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('readResponseBytes', () => {
  it('reports each chunk against Content-Length', async () => {
    const seen: Array<[number, number | null]> = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.enqueue(new Uint8Array([5, 6]));
        controller.close();
      },
    });
    const response = new Response(stream, { headers: { 'content-length': '6' } });
    const buffer = await readResponseBytes(response, (loaded, total) => seen.push([loaded, total]));
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    expect(seen).toEqual([
      [4, 6],
      [6, 6],
    ]);
    expect(downloadProgressPercent(seen[0][0], seen[0][1])).toBe(67);
    expect(downloadProgressPercent(seen[1][0], seen[1][1])).toBe(100);
  });
});
