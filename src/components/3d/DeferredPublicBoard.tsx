'use client';

/**
 * Public board. The flat shirt stays until the 3D model is ready AND the
 * signer is idle (not drawing, placing, or typing a name or note). The two
 * views share one absolute box and crossfade.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { BOARD_3D_DELAY_MS, SHIRT_LOAD_TIMEOUT_MS } from '@/lib/shirt/load-state';
import {
  boardFadeClass,
  boardStatus,
  shouldRevealBoard,
  shouldStartBoardLoad,
  IDLE_SIGNER,
  type BoardModelPhase,
  type SignerBusyness,
} from '@/lib/shirt/board-swap';
import FlatShirt from './FlatShirt';
import type { ExistingSignature } from './TShirtCanvas';
import type TShirtBoardComponent from './TShirtBoard';

const BUSY_SIGNER: SignerBusyness = {
  drawPadOpen: true,
  placementOpen: false,
  typingNameOrNote: false,
};

interface DeferredPublicBoardProps {
  existingSignatures?: ExistingSignature[];
  /** False while the draw pad, placement, or name/note step is active. */
  idle: boolean;
}

export default function DeferredPublicBoard({
  existingSignatures,
  idle,
}: DeferredPublicBoardProps): JSX.Element {
  const [phase, setPhase] = useState<BoardModelPhase>('waiting');
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [BoardView, setBoardView] = useState<typeof TShirtBoardComponent | null>(null);
  const resumeImmediately = useRef(false);
  const activity = idle ? IDLE_SIGNER : BUSY_SIGNER;

  useEffect(() => {
    if (!idle) resumeImmediately.current = true;
  }, [idle]);

  useEffect(() => {
    if (!shouldStartBoardLoad({ phase, activity })) return;
    const delay = resumeImmediately.current ? 0 : BOARD_3D_DELAY_MS;
    const timer = window.setTimeout(() => setPhase('loading'), delay);
    return () => window.clearTimeout(timer);
  }, [phase, idle, activity]);

  useEffect(() => {
    if (phase !== 'loading') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === 'loading' ? 'failed' : current));
    }, SHIRT_LOAD_TIMEOUT_MS);
    if (!BoardView) {
      void import('./TShirtBoard').then((mod) => {
        if (!cancelled) setBoardView(() => mod.default);
      });
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, attempt, BoardView]);

  useEffect(() => {
    if (shouldRevealBoard({ phase, alreadyRevealed: revealed, activity }) && !revealed) {
      setRevealed(true);
    }
  }, [phase, revealed, activity]);

  const status = boardStatus({ phase, revealed });

  return (
    <div className="relative h-full w-full min-h-0">
      <div className={boardFadeClass(!revealed)} aria-hidden={revealed}>
        <FlatShirt existingSignatures={existingSignatures} readOnly className="h-full w-full" />
      </div>
      {BoardView && phase !== 'waiting' ? (
        <div className={`${boardFadeClass(revealed)}${revealed ? '' : ' pointer-events-none'}`} aria-hidden={!revealed}>
          <BoardView
            key={attempt}
            existingSignatures={existingSignatures}
            className="h-full w-full"
            onReady={() => setPhase('ready')}
            onModelError={() => setPhase((current) => (current === 'ready' ? current : 'failed'))}
          />
        </div>
      ) : null}
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center px-3">
        {status === 'loading' ? (
          <p className="text-xs text-white/50">Loading 3D view…</p>
        ) : null}
        {status === 'retry' ? (
          <Button
            type="button"
            className="pointer-events-auto min-h-11 rounded-full bg-white px-6 font-medium text-black hover:bg-gray-200"
            onClick={() => {
              setAttempt((value) => value + 1);
              setPhase('loading');
            }}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
