'use client';

import { useEffect, useState } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { WithId } from './use-collection';

/** Hook return type */
export interface UseDocResult<T> {
  data: WithId<T> | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

/**
 * useDoc — Real-time Firestore document listener.
 * Safe, memoization-friendly, strict-mode-friendly.
 *
 * IMPORTANT:
 * If docRef is constructed from props/state,
 * you MUST memoize it with useMemo to avoid infinite subscriptions.
 */
export function useDoc<T = any>(
  docRef: DocumentReference<DocumentData> | null | undefined
): UseDocResult<T> {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // Reset state when the docRef changes
    setIsLoading(true);
    setData(null);
    setError(null);

    // If no reference provided
    if (!docRef) {
      setIsLoading(false);
      return;
    }

    // Subscribe to Firestore document
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          const raw = snapshot.data() as T;
          setData({ ...raw, id: snapshot.id });
        } else {
          // Doc exists = false => treat as empty but valid
          setData(null);
        }

        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        const contextual = new FirestorePermissionError({
          operation: 'get',
          path: docRef.path,
        });

        setError(contextual);
        setData(null);
        setIsLoading(false);

        // Fire global listener
        errorEmitter.emit('permission-error', contextual);
      }
    );

    return () => unsubscribe();
  }, [docRef]);

  return { data, isLoading, error };
}
