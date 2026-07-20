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
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <div className="flex flex-col items-center gap-3 text-foreground">
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
        <DialogContent className="max-w-5xl w-full h-[92vh] p-0 overflow-hidden flex flex-col bg-black border-white/10 text-white rounded-[2rem] shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10 bg-[#121212] shrink-0">
            <DialogTitle className="text-xl font-bold font-headline tracking-tight">Sign the T-Shirt</DialogTitle>
            <DialogDescription className="text-white/60">
              {pendingPlacement
                ? 'Signature placed! Submit when ready, or click the shirt to reposition.'
                : 'Rotate the shirt and click anywhere on it to open the signing canvas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex-1 min-h-0 bg-transparent overflow-hidden">
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

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 flex-wrap justify-center w-full px-4">
              <Button
                size="sm"
                className="bg-[#1c1c1e] text-white hover:bg-white/10 border border-white/10 rounded-full px-4"
                onClick={() => { shirtRef.current?.undoLast(); setPendingPlacement(null); hasPlacedOneRef.current = false; }}
              >
                <Undo2 className="h-4 w-4 mr-2" /> Undo
              </Button>
              <Button
                size="sm"
                className="bg-[#1c1c1e] text-white hover:bg-white/10 border border-white/10 rounded-full px-4"
                onClick={() => { shirtRef.current?.clearAll(); setPendingPlacement(null); hasPlacedOneRef.current = false; showToast('Cleared.'); }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Clear
              </Button>
              <Button
                size="sm"
                className="bg-[#1c1c1e] text-white hover:bg-white/10 border border-white/10 rounded-full px-4"
                onClick={handleDownload}
              >
                <Camera className="h-4 w-4 mr-2" /> Screenshot
              </Button>
              <Button
                size="sm"
                className="bg-white text-black hover:bg-gray-200 rounded-full px-6 font-medium shadow-sm transition-all"
                onClick={handleSubmit}
                disabled={isSaving || !pendingPlacement}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Done & Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawing canvas modal — opens when user clicks the shirt */}
      <Dialog open={drawOpen} onOpenChange={(v) => { if (!v) handleCancelDraw(); }}>
        <DialogContent className="sm:max-w-[520px] w-full flex flex-col gap-0 p-0 overflow-hidden bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10 bg-[#121212]">
            <DialogTitle className="text-xl font-bold font-headline tracking-tight">Draw Your Signature</DialogTitle>
            <DialogDescription className="text-white/60">
              Use the tools below, then click Place on Shirt.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap bg-[#1c1c1e] border border-white/10 p-2 rounded-xl">
              <Button variant="ghost" size="sm" onClick={() => setSigningTool('pen')} className={signingTool === 'pen' ? 'bg-white/20 text-white hover:bg-white/20 hover:text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}>
                <Pen className="mr-2 h-4 w-4" /> Draw
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSigningTool('text')} className={signingTool === 'text' ? 'bg-white/20 text-white hover:bg-white/20 hover:text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}>
                <Type className="mr-2 h-4 w-4" /> Text
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-white/40 hidden sm:inline">
                Signing as <strong className="text-white/80">{signatoryName}</strong>
              </span>
              <Button variant="ghost" size="icon" onClick={() => signatureRef.current?.clear()} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap bg-[#1c1c1e] border border-white/10 p-3 rounded-xl">
              <span className="text-sm text-white/60">Color:</span>
              {colors.map((color) => (
                <button
                  key={color}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform hover:scale-110', selectedColor === color ? 'border-white scale-110' : 'border-transparent')}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
              {signingTool === 'text' && (
                <>
                  <span className="text-sm ml-2 text-white/60">Font:</span>
                  <Select value={selectedFont} onValueChange={setSelectedFont}>
                    <SelectTrigger className="w-[140px] bg-[#2a2a2c] border-transparent text-white focus:ring-1 focus:ring-white/20 h-8">
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1c1c1e] border-white/10 text-white">
                      {fonts.map((font) => (
                        <SelectItem key={font.className} value={font.className} className={`${font.className} hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer`}>
                          {font.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            <div className="bg-[#1c1c1e] border border-white/10 px-4 py-3 rounded-xl flex items-center gap-3">
              <span className="text-sm text-white/60 shrink-0">Size:</span>
              <Slider min={1} max={12} step={1} value={[selectedSize]} onValueChange={(v) => setSelectedSize(v[0])} className="flex-1" />
            </div>

            <div className="h-56 rounded-2xl border-2 border-white/10 bg-white shadow-inner overflow-hidden relative">
              <SignatureCanvas
                ref={signatureRef}
                tool={signingTool}
                color={selectedColor}
                font={selectedFont}
                size={selectedSize}
                className="w-full h-full"
              />
            </div>
          </div>

          <div className="flex justify-between items-center px-6 pb-6 pt-2">
            <Button variant="ghost" onClick={handleCancelDraw} className="text-white hover:bg-white/10 hover:text-white rounded-full">Cancel</Button>
            <Button onClick={handlePlaceOnShirt} className="bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Place on Shirt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}