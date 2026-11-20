/**
 * Shirt download state. The 2D pad does not wait on this.
 * `fallback` means signing continues on the flat shirt, with Retry.
 */

export const SHIRT_LOAD_TIMEOUT_MS = 20_000;

/** Board 3D waits so the first Slow 3G seconds go to the draw pad. */
export const BOARD_3D_DELAY_MS = 25_000;

export type ShirtLoadPhase = 'idle' | 'loading' | 'ready' | 'fallback';

export type ShirtLoadState = {
  phase: ShirtLoadPhase;
  loadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  timedOut: boolean;
  attempt: number;
};

export type ShirtLoadEvent =
  | { type: 'start' }
  | { type: 'progress'; loadedBytes: number; totalBytes: number | null }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'timeout' }
  | { type: 'retry' };

export function initialShirtLoadState(): ShirtLoadState {
  return {
    phase: 'idle',
    loadedBytes: 0,
    totalBytes: null,
    error: null,
    timedOut: false,
    attempt: 0,
  };
}

export function reduceShirtLoad(state: ShirtLoadState, event: ShirtLoadEvent): ShirtLoadState {
  switch (event.type) {
    case 'start':
      if (state.phase === 'loading' || state.phase === 'ready') return state;
      return {
        phase: 'loading',
        loadedBytes: 0,
        totalBytes: null,
        error: null,
        timedOut: false,
        attempt: state.attempt,
      };
    case 'retry':
      if (state.phase !== 'fallback') return state;
      return {
        phase: 'loading',
        loadedBytes: 0,
        totalBytes: null,
        error: null,
        timedOut: false,
        attempt: state.attempt + 1,
      };
    case 'progress':
      if (state.phase !== 'loading') return state;
      return {
        ...state,
        loadedBytes: Math.max(0, event.loadedBytes),
        totalBytes: event.totalBytes,
      };
    case 'ready':
      if (state.phase !== 'loading') return state;
      return { ...state, phase: 'ready', error: null, timedOut: false };
    case 'error':
      if (state.phase !== 'loading') return state;
      return {
        ...state,
        phase: 'fallback',
        error: event.message.trim() || 'Could not load the 3D shirt.',
      };
    case 'timeout':
      if (state.phase !== 'loading') return state;
      return {
        ...state,
        phase: 'fallback',
        timedOut: true,
        error: 'The 3D shirt is taking too long. You can still sign on the flat shirt.',
      };
    default:
      return state;
  }
}
