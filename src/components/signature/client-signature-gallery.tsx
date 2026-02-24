"use client";

import type { Signature } from "@/lib/types";
import dynamic from 'next/dynamic';
import React from 'react';
import { Loader2 } from "lucide-react";

// Dynamically import the gallery that uses the pan-and-zoom library with SSR turned off.
const SignatureCanvasGallery = dynamic(() => import('./signature-canvas-gallery'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
});

interface ClientSignatureGalleryProps {
  signatures: Signature[];
  isPublic: boolean;
}

export default function ClientSignatureGallery({ signatures, isPublic }: ClientSignatureGalleryProps) {
  return <SignatureCanvasGallery signatures={signatures} isPublic={isPublic} />;
}
