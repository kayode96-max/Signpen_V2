import { SIGNATORY_NOTE_MAX } from '@/lib/security/limits';

/**
 * Signer-flow rules that do not need React.
 * The board URL helper is not in this tree, so share links use the canonical
 * lowercase /{id} path the public board already redirects to.
 */

export { SIGNATORY_NOTE_MAX };

export const SHIRT_HINT_DRAW_AND_SPOT = 'Draw your signature, then add your name. We will pick a free spot.';
export const SHIRT_HINT_DRAW = 'Draw your signature before continuing.';
export const SHIRT_HINT_SPOT = 'Tap the shirt to choose a spot.';
export const SHIRT_HINT_SPOT_TAKEN = "Too close to someone else's — tap a free spot.";
export const DETAILS_HINT = 'Add your name and a note to continue.';
export const CHALLENGE_HINT = 'Complete the spam check before continuing.';
export const AUTO_SPOT_HINT = 'We picked a free spot. Tap the shirt or Place on Shirt to move it.';
export const MOVE_SPOT_HINT = 'Tap the shirt, then Place on Shirt, to move it.';

export type ShirtSubmitInput = {
  hasPlacement: boolean;
  hasDrawing: boolean;
  hasSpot: boolean;
};

export type ShirtSubmitDecision =
  | { action: 'submit' }
  | { action: 'place-then-submit' }
  | { action: 'hint'; hint: string };

/**
 * Done & Submit stays enabled except while a save is in flight.
 * A missing placement is not a reason to disable it.
 */
export function shirtSubmitDisabled(isSaving: boolean): boolean {
  return isSaving;
}

export function hasSignatoryDetails(name: string, note: string): boolean {
  return name.trim().length > 0 && note.trim().length > 0;
}

/** Draw step. An empty pad explains itself; it does not disable the button. */
export function decideDrawContinue(hasDrawing: boolean): { action: 'details' } | { action: 'hint'; hint: string } {
  if (!hasDrawing) return { action: 'hint', hint: SHIRT_HINT_DRAW };
  return { action: 'details' };
}

/** Name and note come after the drawing, and before the spot is chosen. */
export function decideDetailsContinue(input: {
  hasDrawing: boolean;
  name: string;
  note: string;
  challengeBlocked: boolean;
}): { action: 'auto-place' } | { action: 'hint'; hint: string } {
  if (!input.hasDrawing) return { action: 'hint', hint: SHIRT_HINT_DRAW };
  if (input.challengeBlocked) return { action: 'hint', hint: CHALLENGE_HINT };
  if (!hasSignatoryDetails(input.name, input.note)) return { action: 'hint', hint: DETAILS_HINT };
  return { action: 'auto-place' };
}

export function decideShirtSubmit(input: ShirtSubmitInput): ShirtSubmitDecision {
  if (input.hasDrawing && input.hasSpot) return { action: 'place-then-submit' };
  if (input.hasPlacement) return { action: 'submit' };
  if (!input.hasSpot && !input.hasDrawing) {
    return { action: 'hint', hint: SHIRT_HINT_DRAW_AND_SPOT };
  }
  if (!input.hasDrawing) return { action: 'hint', hint: SHIRT_HINT_DRAW };
  return { action: 'hint', hint: SHIRT_HINT_SPOT };
}

export function noteCounterLabel(length: number, max = SIGNATORY_NOTE_MAX): string {
  const count = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  return `${count}/${max}`;
}

/** First whitespace-delimited token of the graduate's name. */
export function graduateFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

export function privateNoteLabel(name: string): string {
  const first = graduateFirstName(name);
  return first ? `Message for ${first} only` : 'Message for the graduate only';
}

export function canonicalBoardUrl(studentId: string, origin: string): string {
  const base = origin.trim().replace(/\/+$/, '');
  const id = studentId.trim().toLowerCase();
  return `${base}/${id}`;
}

export function whatsAppShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function whatsAppBoardShareHref(args: {
  studentName: string;
  studentId: string;
  origin: string;
}): string {
  const url = canonicalBoardUrl(args.studentId, args.origin);
  const name = args.studentName.trim() || 'this graduate';
  return whatsAppShareHref(`I signed ${name}'s board on Signpen. Leave a message: ${url}`);
}

/** Same download the shirt modal uses for Screenshot. No-op without a URL. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl || typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.download = filename;
  a.href = dataUrl;
  a.click();
}
