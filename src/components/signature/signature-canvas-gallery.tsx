'use client';

import { useState, useRef } from 'react';
import type { Signature } from '@/lib/types';
import Image from 'next/image';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatDistanceToNow } from 'date-fns';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface SignatureCanvasGalleryProps {
  signatures: Signature[];
  isPublic: boolean;
  pendingSignature?: { img: string; name: string; note: string } | null;
  onPlaceSignature?: (x: number, y: number) => void;
}

function formatTimestamp(timestamp: Signature['timestamp']): string {
  if (!timestamp) return 'Just now';
  if (typeof timestamp === 'string') {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  }
  if ('toDate' in timestamp) {
    return formatDistanceToNow((timestamp as any).toDate(), { addSuffix: true });
  }
  return 'Just now';
}


export default function SignatureCanvasGallery({
  signatures,
  isPublic,
  pendingSignature,
  onPlaceSignature
}: SignatureCanvasGalleryProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pendingSignature || !onPlaceSignature || !canvasRef.current) return;
    
    // This logic needs to be handled by the parent TransformWrapper
    // We will pass the click event up and let it calculate the position
    // based on its current transformation state (pan and zoom).
  };
  
  if (!isPublic && signatures.length === 0) {
     return (
      <div className="text-center py-12 text-muted-foreground border rounded-lg bg-secondary">
        <p>No signatures yet. Share your page to get started!</p>
      </div>
    );
  }

  return (
      <TransformWrapper 
        minScale={0.5} 
        maxScale={4} 
        initialScale={1}
        panning={{
          disabled: !!pendingSignature,
          velocityDisabled: true,
        }}
        doubleClick={{
          disabled: true,
        }}
      >
        {({ zoomIn, zoomOut, setTransform, ...rest }) => (
          <>
            <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ 
                  width: '100%', 
                  height: '100%', 
                  cursor: pendingSignature ? 'copy' : 'grab',
                }}
                contentProps={{
                    onClick: (e) => {
                        if (!pendingSignature || !onPlaceSignature || !canvasRef.current) return;
                        const state = rest.instance.transformState;
                        const rect = canvasRef.current.getBoundingClientRect();

                        // Calculate mouse position relative to the container
                        const mouseX = e.clientX - rect.left;
                        const mouseY = e.clientY - rect.top;

                        // Adjust for current pan and zoom to get position on the un-transformed content
                        const contentX = (mouseX - state.positionX) / state.scale;
                        const contentY = (mouseY - state.positionY) / state.scale;

                        // Convert to percentage
                        const x = (contentX / rect.width) * 100;
                        const y = (contentY / rect.height) * 100;
                        
                        onPlaceSignature(x, y);
                    }
                }}
            >
              <div ref={canvasRef} className="relative w-full h-full">
                {signatures.map((sig) => {
                  if (!sig.position) {
                    return null;
                  }
                  
                  return (
                  <div
                      key={sig.id}
                      style={{
                        position: 'absolute',
                        left: `${sig.position.x}%`,
                        top: `${sig.position.y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '192px',
                        height: '96px'
                      }}
                  >
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="w-full h-full hover:scale-105 transition-transform duration-200 ease-in-out filter hover:drop-shadow-lg">
                            <Image
                                src={sig.signatureImageUrl}
                                alt={`Signature from ${sig.signatoryName}`}
                                width={192}
                                height={96}
                                className="object-contain mix-blend-darken w-full h-full"
                            />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                          <div className="space-y-2">
                            <p className="font-bold">{sig.signatoryName}</p>
                            <p className="text-sm italic text-muted-foreground">"{sig.signatoryNote}"</p>
                            <div className="text-xs text-muted-foreground pt-2 flex justify-between items-center">
                              <span>{formatTimestamp(sig.timestamp)}</span>
                            </div>
                          </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  )
                })}
                 {isPublic && signatures.length === 0 && !pendingSignature && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
                        <p>The board is empty. Be the first to sign!</p>
                    </div>
                )}
                </div>
            </TransformComponent>

             {pendingSignature && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-50 w-48 h-24">
                     <Image
                        src={pendingSignature.img}
                        alt={`Pending signature from ${pendingSignature.name}`}
                        width={192}
                        height={96}
                        className="object-contain mix-blend-darken"
                    />
                </div>
            )}
          </>
        )}
        </TransformWrapper>
  );
}
