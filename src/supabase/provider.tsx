'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { createAnonymousSignOut } from '@/lib/auth/anonymous-sign-out';
import { readIsAnonymous } from '@/lib/security/access';
import { supabase } from './config';
import { User } from './types';

export interface SupabaseContextState {
  supabase: typeof supabase;
  auth: any;
  firestore: any;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export const SupabaseContext = createContext<SupabaseContextState | undefined>(undefined);

const mapSupabaseUser = (sbUser: any): User => {
  const providers = sbUser.app_metadata?.providers || [sbUser.app_metadata?.provider || 'email'];
  const providerData = providers.map((p: string) => ({
    providerId: p === 'email' ? 'password' : p === 'google' ? 'google.com' : p
  }));

  return {
    uid: sbUser.id,
    email: sbUser.email ?? null,
    displayName: sbUser.user_metadata?.full_name ?? sbUser.user_metadata?.name ?? null,
    photoURL: sbUser.user_metadata?.avatar_url ?? null,
    providerData,
    isAnonymous: readIsAnonymous(sbUser),
  };
};

export const SupabaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [userError, setUserError] = useState<Error | null>(null);

  useEffect(() => {
    // Check initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(mapSupabaseUser(session.user));
        } else {
          setUser(null);
        }
      } catch (err: any) {
        setUserError(err);
      } finally {
        setIsUserLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsUserLoading(true);
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      } else {
        setUser(null);
      }
      setIsUserLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo((): SupabaseContextState => ({
    supabase,
    auth: {
      currentUser: user ? {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        getIdToken: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token || '';
        }
      } : null,
      signOut: async () => {
        await supabase.auth.signOut();
      }
    },
    firestore: supabase,
    user,
    isUserLoading,
    userError,
  }), [user, isUserLoading, userError]);

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
};

export const useSupabase = (): SupabaseContextState => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider.');
  }
  return context;
};

// Aliases for compatibility
export const useFirebase = useSupabase;

export const useUser = () => {
  const { user, isUserLoading, userError } = useSupabase();
  return { user, isUserLoading, userError };
};

// Mock auth object for compatibility with auth.currentUser and signOut
export const useAuth = () => {
  const { user } = useSupabase();
  
  return useMemo(() => ({
    currentUser: user ? {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      providerData: user.providerData,
      getIdToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || '';
      }
    } : null,
    signOut: async () => {
      await supabase.auth.signOut();
    }
  }), [user]);
};

// Mock firestore object for compatibility
export const useFirestore = () => {
  return supabase;
};

// Compatibility functions
export const GoogleAuthProvider = class {};

export const EmailAuthProvider = {
  credential: (email: string, password: string) => {
    return { email, password };
  }
};

export async function reauthenticateWithCredential(user: any, credential: any) {
  const { error } = await supabase.auth.signInWithPassword({
    email: credential.email,
    password: credential.password
  });
  if (error) throw error;
}

export async function updatePassword(user: any, newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });
  if (error) throw error;
}

export async function deleteUser(_user: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('You need to be signed in to delete your account.');
  }

  const response = await fetch('/api/account', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({ error: 'Account deletion failed.' }));
  if (!response.ok) {
    throw new Error(body.error || 'Account deletion failed.');
  }

  // The auth user is already gone. Clear this browser only.
  await supabase.auth.signOut({ scope: 'local' });
}

export async function signInWithEmailAndPassword(auth: any, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function createUserWithEmailAndPassword(auth: any, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return {
    user: data.user ? {
      uid: data.user.id,
      email: data.user.email ?? null,
      displayName: data.user.user_metadata?.full_name ?? null,
      photoURL: data.user.user_metadata?.avatar_url ?? null,
    } : null
  };
}

export async function signInWithPopup(auth: any, provider: any) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`
    }
  });
  if (error) throw error;
}

export async function updateProfile(user: any, profileData: { displayName?: string; photoURL?: string }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn("Skipping updateProfile: No active session (email confirmation may be pending).");
    return;
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: profileData.displayName,
      avatar_url: profileData.photoURL
    }
  });
  if (error) throw error;
}

export async function signOut(auth: any) {
  await supabase.auth.signOut();
}

/** Drop this browser's anonymous signer session. Safe to call from both /dashboard and /login. */
export const signOutAnonymousSession = createAnonymousSignOut({
  getSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      accessToken: session?.access_token ?? null,
      isAnonymous: session?.user ? readIsAnonymous(session.user) : false,
    };
  },
  signOutLocal: async () => {
    await supabase.auth.signOut({ scope: 'local' });
  },
});

export async function signInAnonymously(auth: any) {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}
