'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { getErrorDisplay } from '@/lib/error-display';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Listens for globally emitted Firebase permission errors and shows
 * a user-friendly modal instead of surfacing raw provider/debug text.
 */
export function FirebaseErrorListener() {
  const [error, setError] = useState<FirestorePermissionError | null>(null);

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      setError(error);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  const display = getErrorDisplay(error, {
    title: 'Something went wrong',
    description: 'We could not complete that action right now.',
  });

  return (
    <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
      <DialogContent className="max-w-md border-destructive/30 bg-background p-0 shadow-2xl">
        <div className="rounded-t-2xl bg-destructive/8 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-destructive/12 p-3 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle>{display.title}</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-muted-foreground">
                {display.description}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>
        <DialogFooter className="px-6 py-5 sm:justify-end">
          <Button onClick={() => setError(null)} className="min-w-28">
            Okay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
