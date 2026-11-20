/**
 * The Place step keeps the shirt it opened with.
 * A model that finishes while the signer is still on that step does not swap in.
 */

export type PlaceShirt = 'flat' | '3d';

/** Chosen once, when the signer enters Place. */
export function placeShirtOnEntry(modelSettled: boolean): PlaceShirt {
  return modelSettled ? '3d' : 'flat';
}

/** While Place is open, readiness changing does not change the shirt. */
export function placeShirtWhileOpen(openedAs: PlaceShirt): PlaceShirt {
  return openedAs;
}
