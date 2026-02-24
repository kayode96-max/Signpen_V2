'use client';

import React, { useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Undo2,
  Trash2,
  Camera,
  Info,
  Pen,
  Type,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/signature/signature-canvas';
import { cn } from '@/lib/utils';
import type { TShirtCanvasRef, ExistingSignature } from './TShirtCanvas';

const TShirtCanvas = dynamic(() => import('./TShirtCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-3 text-white">
        <Loader2 className="h-10 w-10 animate-spin" />
        <p className="text-sm font-medium">Loading 3D Model</p>
      </div>
    </div>
  ),
});

const colors = ['#000000', '#EF4444', '#3B82F6', '#22C55E', '#A855F7', '#EAB308'];
const fonts = [
  { name: 'Caveat', className: 'font-caveat' },
  { name: 'Dancing Script', className: 'font-dancing-script' },
  { name: 'Great Vibes', className: 'font-great-vibes' },
  { name: 'Indie Flower', className: 'font-indie-flower' },
  { name: 'Monsieur La Doulaise', className: 'font-monsieur-la-doulaise' },
  { name: 'Pacifico', className: 'font-pacifico' },
  { name: 'Sacramento', className: 'font-sacramento' },
  { name: 'Unifraktur', className: 'font-unifraktur-maguntia' },
];

export interface SignaturePlacementPayload {
  signatureImageUrl: string;
  position: { x: number; y: number };
}

interface TShirtSigningModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (payload: SignaturePlacementPayload) => Promise<void>;
  signatoryName: string;
  existingSignatures?: ExistingSignature[];
}

export default function TShirtSigningModal({
  open,
  onOpenChange,
  onSave,
  signatoryName,
  existingSignatures,
}: TShirtSigningModalProps): JSX.Element {
  const shirtRef = useRef<TShirtCanvasRef>(null);
  const signatureRef = useRef<SignatureCanvasRef>(null);
  const hasPlacedOneRef = useRef(false);

  const [pendingUV, setPendingUV] = useState<{ x: number; y: number } | null>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [pendingPlacement, setPendingPlacement] = useState<SignaturePlacementPayload | null>(null);

  const [signingTool, setSigningTool] = useState<'pen' | 'text'>('pen');
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const [selectedFont, setSelectedFont] = useState(fonts[0].className);
  const [selectedSize, setSelectedSize] = useState(4);

  const showToast = (msg: string, ms = 2500) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), ms);
  };

  const dataUrlToCanvas = useCallback((dataUrl: string) => {
    return new Promise<HTMLCanvasElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }, []);

  const handleShirtClick = useCallback((uv: { x: number; y: number }) => {
    setPendingUV(uv);
    setDrawOpen(true);
  }, []);

  const handlePlaceOnShirt = useCallback(async () => {
    const shirt = shirtRef.current;
    if (!shirt || !pendingUV || !signatureRef.current) return;

    if (signatureRef.current.isEmpty()) {
      showToast('Please draw a signature or write a message first.');
      return;
    }

    const signatureImageUrl = signatureRef.current.toDataURL();
    const sigCanvas = await dataUrlToCanvas(signatureImageUrl);
    if (!sigCanvas) {
      showToast('Unable to read signature image.');
      return;
    }

    if (hasPlacedOneRef.current) {
      shirt.undoLast();
    }

    const ok = shirt.addSignature(sigCanvas, pendingUV, { width: 320, height: 140 });
    if (!ok) {
      showToast('That spot is too close to another signature.');
      return;
    }

    hasPlacedOneRef.current = true;
    setPendingPlacement({
      signatureImageUrl,
      position: {
        x: Number((pendingUV.x * 100).toFixed(2)),
        y: Number(((1 - pendingUV.y) * 100).toFixed(2)),
      },
    });

    setDrawOpen(false);
    setPendingUV(null);
    showToast('Signature placed! Click Done to save.');
  }, [pendingUV, dataUrlToCanvas]);

  const handleCancelDraw = useCallback(() => {
    setDrawOpen(false);
    setPendingUV(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!pendingPlacement) {
      showToast('Click the shirt first to place your signature.');
      return;
    }
    setIsSaving(true);
    try {
      await onSave(pendingPlacement);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }, [pendingPlacement, onSave, onOpenChange]);

  const handleDownload = useCallback(() => {
    const url = shirtRef.current?.getScreenshot();
    if (!url) return;
    const a = document.createElement('a');
    a.download = `signpen-shirt-${Date.now()}.png`;
    a.href = url;
    a.click();
  }, []);

  return (
    <>
      {/* Main 3-D shirt modal */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-full h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 border-b bg-background shrink-0">
            <DialogTitle className="text-lg font-bold font-headline">Sign the T-Shirt</DialogTitle>
            <DialogDescription>
              {pendingPlacement
                ? 'Signature placed! Submit when ready, or click the shirt to reposition.'
                : 'Rotate the shirt and click anywhere on it to open the signing canvas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
            <TShirtCanvas
              ref={shirtRef}
              onShirtClick={handleShirtClick}
              existingSignatures={existingSignatures}
              className="w-full h-full"
            />

            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs rounded-full px-4 py-1.5 flex items-center gap-2 pointer-events-none">
              <Info className="h-3 w-3" />
              <span>Rotate: drag  Sign: click the shirt</span>
            </div>

            {toastMsg && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm rounded-lg px-4 py-2 pointer-events-none z-50">
                {toastMsg}
              </div>
            )}

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center">
              <Button
                size="sm"
                variant="secondary"
                className="bg-black/60 text-white border-white/20 hover:bg-black/80"
                onClick={() => { shirtRef.current?.undoLast(); setPendingPlacement(null); hasPlacedOneRef.current = false; }}
              >
                <Undo2 className="h-4 w-4 mr-1" /> Undo
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-black/60 text-white border-white/20 hover:bg-black/80"
                onClick={() => { shirtRef.current?.clearAll(); setPendingPlacement(null); hasPlacedOneRef.current = false; showToast('Cleared.'); }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Clear
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-black/60 text-white border-white/20 hover:bg-black/80"
                onClick={handleDownload}
              >
                <Camera className="h-4 w-4 mr-1" /> Screenshot
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSubmit}
                disabled={isSaving || !pendingPlacement}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Done  Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawing canvas modal  opens when user clicks the shirt */}
      <Dialog open={drawOpen} onOpenChange={(v) => { if (!v) handleCancelDraw(); }}>
        <DialogContent className="sm:max-w-[520px] w-full flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="font-headline">Draw Your Signature</DialogTitle>
            <DialogDescription>
              Use the tools below, then click Place on Shirt.
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap bg-secondary p-2 rounded-md">
              <Button variant={signingTool === 'pen' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSigningTool('pen')}>
                <Pen className="mr-2 h-4 w-4" /> Draw
              </Button>
              <Button variant={signingTool === 'text' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSigningTool('text')}>
                <Type className="mr-2 h-4 w-4" /> Text
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Signing as <strong>{signatoryName}</strong>
              </span>
              <Button variant="ghost" size="icon" onClick={() => signatureRef.current?.clear()} className="text-destructive hover:text-destructive">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap bg-secondary p-2 rounded-md">
              <span className="text-sm">Color:</span>
              {colors.map((color) => (
                <button
                  key={color}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform hover:scale-110', selectedColor === color ? 'border-primary scale-110' : 'border-transparent')}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
              {signingTool === 'text' && (
                <>
                  <span className="text-sm ml-2">Font:</span>
                  <Select value={selectedFont} onValueChange={setSelectedFont}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      {fonts.map((font) => (
                        <SelectItem key={font.className} value={font.className} className={font.className}>
                          {font.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            <div className="bg-secondary px-3 py-2 rounded-md flex items-center gap-3">
              <span className="text-sm shrink-0">Size:</span>
              <Slider min={1} max={12} step={1} value={[selectedSize]} onValueChange={(v) => setSelectedSize(v[0])} className="flex-1" />
            </div>

            <div className="h-56 rounded-lg border-2 border-dashed border-border bg-white shadow-inner overflow-hidden">
              <SignatureCanvas
                ref={signatureRef}
                tool={signingTool}
                color={selectedColor}
                font={selectedFont}
                size={selectedSize}
                className="rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-between items-center px-4 pb-4">
            <Button variant="ghost" onClick={handleCancelDraw}>Cancel</Button>
            <Button onClick={handlePlaceOnShirt}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Place on Shirt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}