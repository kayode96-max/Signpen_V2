export interface OwnSignature {
  id: string;
  signatoryName: string;
  signatoryNote: string;
  privateBySigner: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function ownKey(studentId: string): string {
  return `signpen-own-signature:${studentId}`;
}

function closedKey(studentId: string): string {
  return `signpen-edits-closed:${studentId}`;
}

export function readOwnSignature(store: KeyValueStore, studentId: string): OwnSignature | null {
  const raw = store.getItem(ownKey(studentId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OwnSignature>;
    if (!parsed || typeof parsed.id !== "string" || parsed.id.length === 0) return null;
    return {
      id: parsed.id,
      signatoryName: typeof parsed.signatoryName === "string" ? parsed.signatoryName : "",
      signatoryNote: typeof parsed.signatoryNote === "string" ? parsed.signatoryNote : "",
      privateBySigner: parsed.privateBySigner === true,
    };
  } catch {
    return null;
  }
}

export function saveOwnSignature(store: KeyValueStore, studentId: string, signature: OwnSignature): void {
  store.setItem(ownKey(studentId), JSON.stringify(signature));
}

export function clearOwnSignature(store: KeyValueStore, studentId: string): void {
  store.removeItem(ownKey(studentId));
}

export function readEditsClosed(store: KeyValueStore, studentId: string): boolean {
  return store.getItem(closedKey(studentId)) === "1";
}

export function saveEditsClosed(store: KeyValueStore, studentId: string): void {
  store.setItem(closedKey(studentId), "1");
}

export function clearEditsClosed(store: KeyValueStore, studentId: string): void {
  store.removeItem(closedKey(studentId));
}
