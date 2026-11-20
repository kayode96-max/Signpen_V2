import { describe, expect, it } from 'vitest';
import { initialShirtLoadState, reduceShirtLoad, SHIRT_LOAD_TIMEOUT_MS } from './load-state';

describe('shirt load state', () => {
  it('keeps a 20 second timeout for Slow 3G', () => {
    expect(SHIRT_LOAD_TIMEOUT_MS).toBe(20_000);
  });

  it('tracks byte progress only while loading', () => {
    const loading = reduceShirtLoad(initialShirtLoadState(), { type: 'start' });
    const progressed = reduceShirtLoad(loading, {
      type: 'progress',
      loadedBytes: 1200,
      totalBytes: 4000,
    });
    expect(progressed).toMatchObject({ phase: 'loading', loadedBytes: 1200, totalBytes: 4000 });
    const ready = reduceShirtLoad(progressed, { type: 'ready' });
    const ignored = reduceShirtLoad(ready, { type: 'progress', loadedBytes: 10, totalBytes: 10 });
    expect(ignored).toBe(ready);
  });

  it('falls back on a load error and again on timeout', () => {
    const loading = reduceShirtLoad(initialShirtLoadState(), { type: 'start' });
    const failed = reduceShirtLoad(loading, { type: 'error', message: 'network down' });
    expect(failed.phase).toBe('fallback');
    expect(failed.error).toBe('network down');
    expect(failed.timedOut).toBe(false);

    const slow = reduceShirtLoad(loading, { type: 'timeout' });
    expect(slow.phase).toBe('fallback');
    expect(slow.timedOut).toBe(true);
  });

  it('retry starts a new attempt and ignores a late ready from the old one', () => {
    const loading = reduceShirtLoad(initialShirtLoadState(), { type: 'start' });
    const failed = reduceShirtLoad(loading, { type: 'timeout' });
    const retried = reduceShirtLoad(failed, { type: 'retry' });
    expect(retried).toMatchObject({ phase: 'loading', attempt: 1, loadedBytes: 0, error: null });
    const stale = reduceShirtLoad(failed, { type: 'ready' });
    expect(stale.phase).toBe('fallback');
    const ready = reduceShirtLoad(retried, { type: 'ready' });
    expect(ready.phase).toBe('ready');
    expect(reduceShirtLoad(ready, { type: 'timeout' }).phase).toBe('ready');
  });

  it('does not reset a download that is already in flight', () => {
    const loading = reduceShirtLoad(initialShirtLoadState(), { type: 'start' });
    const progressed = reduceShirtLoad(loading, { type: 'progress', loadedBytes: 50, totalBytes: 100 });
    expect(reduceShirtLoad(progressed, { type: 'start' })).toBe(progressed);
    expect(reduceShirtLoad(progressed, { type: 'retry' })).toBe(progressed);
  });
});
