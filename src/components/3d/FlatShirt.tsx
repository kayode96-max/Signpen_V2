'use client';

/**
 * Flat front of the shirt. Used while the 3D model is downloading and when
 * the model fails, so a signer can still choose a spot and submit.
 * Chest clicks map into the same position percentages the API stores.
 */

import type { ExistingSignature } from './TShirtCanvas';
import { frontClickToPosition, positionOnFront, type ShirtPoint } from '@/lib/shirt/spot';

export interface FlatShirtMark {
  imageUrl: string;
  position: ShirtPoint;
}

interface FlatShirtProps {
  existingSignatures?: ExistingSignature[];
  pending?: FlatShirtMark | null;
  readOnly?: boolean;
  onSelect?: (position: ShirtPoint) => void;
  className?: string;
}

export default function FlatShirt({
  existingSignatures,
  pending,
  readOnly = false,
  onSelect,
  className,
}: FlatShirtProps) {
  const marks: Array<FlatShirtMark & { key: string }> = [];
  (existingSignatures ?? []).forEach((signature, index) => {
    if (!signature?.signatureImageUrl || !signature.position) return;
    marks.push({
      key: `existing-${index}`,
      imageUrl: signature.signatureImageUrl,
      position: signature.position,
    });
  });
  if (pending?.imageUrl) {
    marks.push({ key: 'pending', imageUrl: pending.imageUrl, position: pending.position });
  }

  return (
    <div className={className ?? 'relative h-full w-full'}>
      <svg viewBox="0 0 200 230" className="h-full w-full" role="img" aria-hidden="true">
        <path
          d="M62 46 L28 62 L14 92 L38 108 L48 90 L48 200 L152 200 L152 90 L162 108 L186 92 L172 62 L138 46 C128 62 112 70 100 70 C88 70 72 62 62 46 Z"
          fill="#f7f4ee"
          stroke="#d9d3c7"
          strokeWidth="2"
        />
      </svg>
      <div className="absolute left-[24%] top-[30%] h-[52%] w-[52%]">
        {marks.map((mark) => {
          const local = positionOnFront(mark.position);
          if (!local) return null;
          return (
            <div
              key={mark.key}
              role="img"
              aria-label="Signature"
              className="pointer-events-none absolute max-w-none bg-contain bg-center bg-no-repeat"
              style={{
                left: `${local.x * 100}%`,
                top: `${local.y * 100}%`,
                width: '46%',
                height: '22%',
                transform: 'translate(-50%, -50%)',
                backgroundImage: `url("${mark.imageUrl}")`,
              }}
            />
          );
        })}
        {readOnly ? (
          <div className="absolute inset-0" aria-label="T-shirt" role="img" />
        ) : (
          <button
            type="button"
            aria-label="Choose a spot on the shirt"
            className="absolute inset-0 cursor-crosshair rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            onClick={(event) => {
              if (!onSelect) return;
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return;
              onSelect(frontClickToPosition(
                (event.clientX - rect.left) / rect.width,
                (event.clientY - rect.top) / rect.height,
              ));
            }}
          />
        )}
      </div>
    </div>
  );
}
