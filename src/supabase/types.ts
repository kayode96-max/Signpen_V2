export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData: { providerId: string }[];
  /** Supabase anonymous signer. Not a board owner. */
  isAnonymous: boolean;
}
