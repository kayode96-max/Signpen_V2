'use client';

import { supabase } from './config';

export * from './config';
export * from './types';
export * from './provider';
export * from './db-hooks';
export * from './storage';

// Keep a synchronous cache of the current session by subscribing to changes
let currentSession: any = null;

supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
});

// Load the initial session on startup
supabase.auth.getSession().then(({ data: { session } }) => {
  currentSession = session;
});

// Compatibility singleton for module-level Auth
export const auth = {
  get currentUser() {
    if (!currentSession?.user) return null;

    return {
      uid: currentSession.user.id,
      email: currentSession.user.email ?? null,
      displayName: currentSession.user.user_metadata?.full_name ?? null,
      photoURL: currentSession.user.user_metadata?.avatar_url ?? null,
      getIdToken: async () => {
        // Refresh session if needed
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || currentSession?.access_token || '';
      }
    };
  }
};

export function initializeFirebase() {
  return {
    firestore: {},
    auth
  };
}
