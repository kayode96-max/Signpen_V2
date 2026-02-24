'use client';

/**
 * TShirtBoard – read-only display of the 3D t-shirt with all existing
 * signatures baked in.  Used both on the public signing page (as the board)
 * and on the dashboard (replacing the flat canvas gallery).
 *
 * Exposes `getScreenshot()` via a forwarded ref so the dashboard's
 * "Download Board" button continues to work.
 */

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { TShirtCanvasRef, ExistingSignature } from './TShirtCanvas';

export interface TShirtBoardRef {
  getScreenshot: () => string;
}

interface TShirtBoardProps {
  existingSignatures?: ExistingSignature[];
  className?: string;
}

const TShirtCanvas = dynamic(() => import('./TShirtCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black rounded-lg">
      <div className="flex flex-col items-center gap-3 text-white">
        <Loader2 className="h-10 w-10 animate-spin" />
        <p className="text-sm font-medium">Loading 3D Board…</p>
      </div>
    </div>
  ),
});

const TShirtBoard = forwardRef<TShirtBoardRef, TShirtBoardProps>(
  ({ existingSignatures, className }, ref) => {
    const canvasRef = useRef<TShirtCanvasRef>(null);

    useImperativeHandle(ref, () => ({
      getScreenshot() {
        return canvasRef.current?.getScreenshot() ?? '';
      },
    }));

    return (
      <TShirtCanvas
        ref={canvasRef}
        existingSignatures={existingSignatures}
        readOnly
        className={className}
      />
    );
  }
);

TShirtBoard.displayName = 'TShirtBoard';
export default TShirtBoard;
