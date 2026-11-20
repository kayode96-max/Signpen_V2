import { describe, expect, it } from 'vitest';
import {
  BOARD_3D_FADE_MS,
  IDLE_SIGNER,
  boardFadeClass,
  boardFramesAllowed,
  boardStatus,
  boardSwapAllowed,
  shouldMountBoardCanvas,
  shouldRevealBoard,
  shouldStartBoardLoad,
  signerBusyness,
} from './board-swap';

const busy = {
  drawPadOpen: false,
  placementOpen: false,
  typingNameOrNote: false,
};

describe('board swap gate', () => {
  it('allows the swap only when drawing, placing, and typing are all idle', () => {
    expect(boardSwapAllowed(IDLE_SIGNER)).toBe(true);
    expect(boardSwapAllowed(busy)).toBe(true);
  });

  it('holds the swap while the draw pad is open', () => {
    expect(boardSwapAllowed({ ...busy, drawPadOpen: true })).toBe(false);
  });

  it('holds the swap while a signature is being placed', () => {
    expect(boardSwapAllowed({ ...busy, placementOpen: true })).toBe(false);
  });

  it('holds the swap while the signer is typing a name or a note', () => {
    expect(boardSwapAllowed({ ...busy, typingNameOrNote: true })).toBe(false);
    expect(signerBusyness({
      modalOpen: true,
      stage: 'details',
      nameFieldFocused: true,
      noteFieldFocused: false,
    }).typingNameOrNote).toBe(true);
    expect(signerBusyness({
      modalOpen: true,
      stage: 'details',
      nameFieldFocused: false,
      noteFieldFocused: true,
    }).typingNameOrNote).toBe(true);
    // The name step itself is typing, including the gap between the two fields.
    expect(signerBusyness({
      modalOpen: true,
      stage: 'details',
      nameFieldFocused: false,
      noteFieldFocused: false,
    }).typingNameOrNote).toBe(true);
  });

  it('treats a closed modal as idle even if a field was focused', () => {
    expect(signerBusyness({
      modalOpen: false,
      stage: 'details',
      nameFieldFocused: true,
      noteFieldFocused: true,
    })).toEqual(IDLE_SIGNER);
  });

  it('does not reveal a ready model until the signer is idle, then keeps it', () => {
    const typing = { ...busy, typingNameOrNote: true };
    expect(shouldRevealBoard({ phase: 'ready', alreadyRevealed: false, activity: typing })).toBe(false);
    expect(shouldRevealBoard({ phase: 'ready', alreadyRevealed: false, activity: IDLE_SIGNER })).toBe(true);
    expect(shouldRevealBoard({ phase: 'loading', alreadyRevealed: false, activity: IDLE_SIGNER })).toBe(false);
    expect(shouldRevealBoard({ phase: 'ready', alreadyRevealed: true, activity: typing })).toBe(true);
  });

  it('does not start the load while the signer is drawing or typing', () => {
    expect(shouldStartBoardLoad({ phase: 'waiting', activity: IDLE_SIGNER })).toBe(true);
    expect(shouldStartBoardLoad({
      phase: 'waiting',
      activity: { ...busy, drawPadOpen: true },
    })).toBe(false);
    expect(shouldStartBoardLoad({
      phase: 'waiting',
      activity: { ...busy, typingNameOrNote: true },
    })).toBe(false);
    expect(shouldStartBoardLoad({ phase: 'loading', activity: IDLE_SIGNER })).toBe(false);
  });

  it('does not render the board 3D while the signing modal is open', () => {
    const drawing = signerBusyness({
      modalOpen: true,
      stage: 'draw',
      nameFieldFocused: false,
      noteFieldFocused: false,
    });
    const placing = signerBusyness({
      modalOpen: true,
      stage: 'shirt',
      nameFieldFocused: false,
      noteFieldFocused: false,
    });
    expect(boardFramesAllowed(drawing)).toBe(false);
    expect(boardFramesAllowed(placing)).toBe(false);
    expect(shouldMountBoardCanvas({ phase: 'loading', revealed: false, activity: drawing })).toBe(false);
    expect(shouldMountBoardCanvas({ phase: 'ready', revealed: true, activity: placing })).toBe(true);
    expect(boardFramesAllowed(IDLE_SIGNER)).toBe(true);
    expect(shouldMountBoardCanvas({ phase: 'loading', revealed: false, activity: IDLE_SIGNER })).toBe(true);
  });
});

describe('board status and crossfade', () => {
  it('shows a loading line, then Retry, and neither once the 3D view is visible', () => {
    expect(boardStatus({ phase: 'loading', revealed: false })).toBe('loading');
    expect(boardStatus({ phase: 'failed', revealed: false })).toBe('retry');
    expect(boardStatus({ phase: 'ready', revealed: false })).toBe('none');
    expect(boardStatus({ phase: 'loading', revealed: true })).toBe('none');
    expect(boardStatus({ phase: 'failed', revealed: true })).toBe('none');
  });

  it('crossfades for 300ms inside one box and skips the fade when motion is reduced', () => {
    expect(BOARD_3D_FADE_MS).toBe(300);
    const shown = boardFadeClass(true);
    const hidden = boardFadeClass(false);
    expect(shown).toContain('absolute inset-0');
    expect(hidden).toContain('absolute inset-0');
    expect(shown).toContain('duration-300');
    expect(shown).toContain('motion-reduce:duration-0');
    expect(shown).toContain('opacity-100');
    expect(hidden).toContain('opacity-0');
  });
});
