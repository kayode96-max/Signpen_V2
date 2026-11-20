/**
 * When the public board may replace the flat shirt with the 3D one.
 * Drawing, placing, and typing a name or note all keep the flat shirt up.
 * A model that finishes during that time waits until the signer is idle.
 */

export const BOARD_3D_FADE_MS = 300;

export type SignerBusyness = {
  drawPadOpen: boolean;
  placementOpen: boolean;
  /** Name or note field is the current step, or one of those fields has focus. */
  typingNameOrNote: boolean;
};

export const IDLE_SIGNER: SignerBusyness = {
  drawPadOpen: false,
  placementOpen: false,
  typingNameOrNote: false,
};

export type SigningStage = 'draw' | 'details' | 'shirt';

export function signerBusyness(input: {
  modalOpen: boolean;
  stage: SigningStage;
  nameFieldFocused: boolean;
  noteFieldFocused: boolean;
}): SignerBusyness {
  if (!input.modalOpen) return IDLE_SIGNER;
  return {
    drawPadOpen: input.stage === 'draw',
    placementOpen: input.stage === 'shirt',
    typingNameOrNote:
      input.stage === 'details' || input.nameFieldFocused || input.noteFieldFocused,
  };
}

/** True only when the pad, the placement step, and the name/note fields are all idle. */
export function boardSwapAllowed(activity: SignerBusyness): boolean {
  return !activity.drawPadOpen && !activity.placementOpen && !activity.typingNameOrNote;
}

export type BoardModelPhase = 'waiting' | 'loading' | 'ready' | 'failed';

/**
 * The 3D layer may appear only after the model is ready and the signer is idle.
 * Once it is visible it stays, so a later drawing session does not flash the flat shirt.
 */
export function shouldRevealBoard(input: {
  phase: BoardModelPhase;
  alreadyRevealed: boolean;
  activity: SignerBusyness;
}): boolean {
  if (input.alreadyRevealed) return true;
  return input.phase === 'ready' && boardSwapAllowed(input.activity);
}

/** The 25s wait (or the immediate resume) may begin only while the signer is idle. */
export function shouldStartBoardLoad(input: {
  phase: BoardModelPhase;
  activity: SignerBusyness;
}): boolean {
  return input.phase === 'waiting' && boardSwapAllowed(input.activity);
}

/** The public 3D canvas may draw a frame only while the signing modal is closed. */
export function boardFramesAllowed(activity: SignerBusyness): boolean {
  return boardSwapAllowed(activity);
}

/**
 * Mount the canvas once a load has started and the signer is idle.
 * A shirt that is already visible stays mounted while the modal is open so its
 * render loop can pause instead of starting a new WebGL context.
 */
export function shouldMountBoardCanvas(input: {
  phase: BoardModelPhase;
  revealed: boolean;
  activity: SignerBusyness;
}): boolean {
  if (input.phase === 'waiting' || input.phase === 'failed') return false;
  if (boardFramesAllowed(input.activity)) return true;
  return input.revealed;
}

export type BoardStatus = 'none' | 'loading' | 'retry';

/** The line under the flat shirt. Ready-but-held shows nothing; failure replaces loading with Retry. */
export function boardStatus(input: {
  phase: BoardModelPhase;
  revealed: boolean;
}): BoardStatus {
  if (input.revealed) return 'none';
  if (input.phase === 'loading') return 'loading';
  if (input.phase === 'failed') return 'retry';
  return 'none';
}

/** Both layers share this box so the crossfade cannot change layout. */
export function boardFadeClass(visible: boolean): string {
  return [
    'absolute inset-0 transition-opacity duration-300 motion-reduce:duration-0 motion-reduce:transition-none',
    visible ? 'opacity-100' : 'opacity-0',
  ].join(' ');
}
