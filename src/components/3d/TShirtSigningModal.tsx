'use client';

import React, { useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  SHIRT_HINT_DRAW,
  SHIRT_HINT_DRAW_AND_SPOT,
  SHIRT_HINT_SPOT_TAKEN,
  decideShirtSubmit,
  downloadDataUrl,
  shirtSubmitDisabled,
} from '@/lib/signing/signer-ui';
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

const SIGNATURE_COLORS = [
  { value: '#000000', name: 'Black' },
  { value: '#EF4444', name: 'Red' },
  { value: '#3B82F6', name: 'Blue' },
  { value: '#22C55E', name: 'Green' },
  { value: '#A855F7', name: 'Purple' },
  { value: '#EAB308', name: 'Yellow' },
] as const;

const fonts = [
  { name: 'Alex Brush', className: 'font-alex-brush' },
  { name: 'Allura', className: 'font-allura' },
  { name: 'Caveat', className: 'font-caveat' },
  { name: 'Cedarville Cursive', className: 'font-cedarville-cursive' },
  { name: 'Cookie', className: 'font-cookie' },
  { name: 'Dancing Script', className: 'font-dancing-script' },
  { name: 'Great Vibes', className: 'font-great-vibes' },
  { name: 'Indie Flower', className: 'font-indie-flower' },
  { name: 'Italianno', className: 'font-italianno' },
  { name: 'Kaushan Script', className: 'font-kaushan-script' },
  { name: 'Marck Script', className: 'font-marck-script' },
  { name: 'Monsieur La Doulaise', className: 'font-monsieur-la-doulaise' },
  { name: 'Nothing You Could Do', className: 'font-nothing-you-could-do' },
  { name: 'Pacifico', className: 'font-pacifico' },
  { name: 'Parisienne', className: 'font-parisienne' },
  { name: 'Sacramento', className: 'font-sacramento' },
  { name: 'Satisfy', className: 'font-satisfy' },
  { name: 'Tangerine', className: 'font-tangerine' },
  { name: 'Unifraktur', className: 'font-unifraktur-maguntia' },
  { name: 'Yellowtail', className: 'font-yellowtail' },
];

const toolbarButtonClass =
  'min-h-11 bg-[#1c1c1e] text-white hover:bg-white/10 border border-white/10 rounded-full px-4';

export interface SignaturePlacementPayload {
  signatureImageUrl: string;
  position: { x: number; y: number };
}

interface TShirtSigningModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (payload: SignaturePlacementPayload) => Promise<void>;
  /** PNG of the shirt after the signature is on it, for the thank-you save action. */
  onScreenshot?: (dataUrl: string) => void;
  signatoryName: string;
  existingSignatures?: ExistingSignature[];
}

export default function TShirtSigningModal({
  open,
  onOpenChange,
  onSave,
  onScreenshot,
  signatoryName,
  existingSignatures,
}: TShirtSigningModalProps): JSX.Element {
  const shirtRef = useRef<TShirtCanvasRef>(null);
  const signatureRef = useRef<SignatureCanvasRef>(null);
  const { toast } = useToast();

  const [pendingUV, setPendingUV] = useState<{ x: number; y: number } | null>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [pendingPlacement, setPendingPlacement] = useState<SignaturePlacementPayload | null>(null);
  const [showSpotTakenError, setShowSpotTakenError] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [draftDataUrl, setDraftDataUrl] = useState<string | null>(null);
  const [placeHint, setPlaceHint] = useState('');

  const [signingTool, setSigningTool] = useState<'pen' | 'text'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>(SIGNATURE_COLORS[0].value);
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

  const syncDrawing = useCallback(() => {
    const signature = signatureRef.current;
    if (!signature) return;
    const empty = signature.isEmpty();
    setHasDrawing(!empty);
    if (!empty) {
      setDraftDataUrl(signature.toDataURL());
      setPlaceHint('');
    }
  }, []);

  const handleShirtClick = useCallback((uv: { x: number; y: number }) => {
    setPendingUV(uv);
    setPlaceHint('');
    setDrawOpen(true);
  }, []);

  const placeDrawing = useCallback(async (options?: { quiet?: boolean }): Promise<SignaturePlacementPayload | null> => {
    const shirt = shirtRef.current;
    if (!shirt || !pendingUV) return null;

    let signatureImageUrl = '';
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      signatureImageUrl = signatureRef.current.toDataURL();
    } else if (draftDataUrl) {
      signatureImageUrl = draftDataUrl;
    }
    if (!signatureImageUrl) {
      setPlaceHint(SHIRT_HINT_DRAW);
      return null;
    }

    const sigCanvas = await dataUrlToCanvas(signatureImageUrl);
    if (!sigCanvas) {
      showToast('Unable to read signature image.');
      return null;
    }

    // A rejected spot leaves the current mark where it is and does not change pendingPlacement.
    const ok = shirt.addSignature(sigCanvas, pendingUV, { width: 320, height: 140 });
    if (!ok) {
      toast({ title: SHIRT_HINT_SPOT_TAKEN });
      setPlaceHint(SHIRT_HINT_SPOT_TAKEN);
      return null;
    }

    const placement: SignaturePlacementPayload = {
      signatureImageUrl,
      position: {
        x: Number((pendingUV.x * 100).toFixed(2)),
        y: Number(((1 - pendingUV.y) * 100).toFixed(2)),
      },
    };

    setPendingPlacement(placement);
    setDrawOpen(false);
    setPendingUV(null);
    setDraftDataUrl(null);
    setHasDrawing(false);
    setPlaceHint('');
    if (!options?.quiet) showToast('Signature placed. Tap Done & Submit to save.');
    return placement;
  }, [pendingUV, draftDataUrl, dataUrlToCanvas, toast]);

  const handlePlaceOnShirt = useCallback(async () => {
    if (signatureRef.current?.isEmpty() && !draftDataUrl) {
      showToast('Please draw a signature or write a message first.');
      setPlaceHint('Draw your signature before placing it.');
      return;
    }
    await placeDrawing();
  }, [draftDataUrl, placeDrawing]);

  const handleCancelDraw = useCallback(() => {
    signatureRef.current?.clear();
    setDrawOpen(false);
    setPendingUV(null);
    setHasDrawing(false);
    setDraftDataUrl(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSaving) return;
    const liveDrawing = signatureRef.current ? !signatureRef.current.isEmpty() : false;
    const decision = decideShirtSubmit({
      hasPlacement: Boolean(pendingPlacement),
      hasDrawing: liveDrawing || hasDrawing || Boolean(draftDataUrl),
      hasSpot: Boolean(pendingUV),
    });

    if (decision.action === 'hint') {
      setPlaceHint(decision.hint);
      return;
    }

    let placement = pendingPlacement;
    if (decision.action === 'place-then-submit') {
      placement = await placeDrawing({ quiet: true });
      if (!placement) return;
    }
    if (!placement) {
      setPlaceHint(SHIRT_HINT_DRAW_AND_SPOT);
      return;
    }

    setPlaceHint('');
    setIsSaving(true);
    try {
      const picture = shirtRef.current?.getScreenshot() ?? '';
      if (picture) onScreenshot?.(picture);
      await onSave(placement);
      setDrawOpen(false);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, pendingPlacement, hasDrawing, draftDataUrl, pendingUV, placeDrawing, onSave, onScreenshot, onOpenChange]);

  const handleDownload = useCallback(() => {
    const url = shirtRef.current?.getScreenshot();
    if (!url) return;
    downloadDataUrl(url, `signpen-shirt-${Date.now()}.png`);
  }, []);

  const guidance = decideShirtSubmit({
    hasPlacement: Boolean(pendingPlacement),
    hasDrawing: hasDrawing || Boolean(draftDataUrl),
    hasSpot: Boolean(pendingUV),
  });
  const hint = guidance.action === 'hint' ? (placeHint || guidance.hint) : placeHint;
  const submitDisabled = shirtSubmitDisabled(isSaving);

  return (
    <>
      {/* Main 3-D shirt modal */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-[min(64rem,calc(100vw-1rem))] h-[92vh] p-0 overflow-hidden flex flex-col bg-black border-white/10 text-white rounded-[2rem] shadow-2xl">
          <DialogHeader className="px-6 pr-14 pt-6 pb-4 border-b border-white/10 bg-[#121212] shrink-0">
            <DialogTitle className="text-xl font-bold font-headline tracking-tight">Sign the T-Shirt</DialogTitle>
            <DialogDescription className="text-white/60">
              {pendingPlacement
                ? 'Signature placed! Submit when ready, or tap the shirt to reposition.'
                : 'Turn the shirt and tap it to open the signing canvas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex-1 min-h-0 bg-transparent overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 relative w-full h-full">
              <TShirtCanvas
                ref={shirtRef}
                onShirtClick={handleShirtClick}
                onExistingSignatureClick={() => setShowSpotTakenError(true)}
                existingSignatures={existingSignatures}
                className="w-full h-full"
              />

              <div className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-xs text-white pointer-events-none">
                <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Drag to turn · Tap to sign</span>
              </div>

              {toastMsg && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm rounded-lg px-4 py-2 pointer-events-none z-50 max-w-[calc(100%-2rem)] text-center break-words">
                  {toastMsg}
                </div>
              )}
            </div>

            <div className="shrink-0 flex gap-3 flex-wrap justify-center w-full max-w-full px-4 pb-6 pt-3 bg-[#121212] border-t border-white/10 z-20">
              {hint ? (
                <p id="shirt-submit-hint" role="status" className="w-full text-center text-sm text-white/80 break-words">
                  {hint}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className={toolbarButtonClass}
                onClick={() => { shirtRef.current?.undoLast(); setPendingPlacement(null); }}
              >
                <Undo2 className="h-4 w-4 mr-2" /> Undo
              </Button>
              <Button
                type="button"
                size="sm"
                className={toolbarButtonClass}
                onClick={() => { shirtRef.current?.clearAll(); setPendingPlacement(null); showToast('Cleared.'); }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Clear mine
              </Button>
              <Button
                type="button"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleDownload}
              >
                <Camera className="h-4 w-4 mr-2" /> Screenshot
              </Button>
              <Button
                type="button"
                size="sm"
                className="min-h-11 bg-white text-black hover:bg-gray-200 rounded-full px-6 font-medium shadow-sm transition-all"
                onClick={handleSubmit}
                disabled={submitDisabled}
                aria-describedby={hint ? 'shirt-submit-hint' : undefined}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Done & Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawing canvas modal — opens when user taps the shirt */}
      <Dialog open={drawOpen} onOpenChange={(v) => { if (!v) { syncDrawing(); setDrawOpen(false); } }}>
        <DialogContent className="w-full max-w-[min(520px,calc(100vw-1rem))] flex flex-col gap-0 p-0 overflow-hidden bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl max-h-[92dvh]">
          <DialogHeader className="px-6 pr-14 pt-6 pb-4 border-b border-white/10 bg-[#121212] shrink-0">
            <DialogTitle className="text-xl font-bold font-headline tracking-tight">Draw Your Signature</DialogTitle>
            <DialogDescription className="text-white/60">
              Use the tools below. Done & Submit places this on the spot you chose.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap bg-[#1c1c1e] border border-white/10 p-2 rounded-xl">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSigningTool('pen')} className={cn('min-h-11', signingTool === 'pen' ? 'bg-white/20 text-white hover:bg-white/20 hover:text-white' : 'text-white/60 hover:text-white hover:bg-white/10')}>
                <Pen className="mr-2 h-4 w-4" /> Draw
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSigningTool('text')} className={cn('min-h-11', signingTool === 'text' ? 'bg-white/20 text-white hover:bg-white/20 hover:text-white' : 'text-white/60 hover:text-white hover:bg-white/10')}>
                <Type className="mr-2 h-4 w-4" /> Text
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-white/40 hidden sm:inline">
                Signing as <strong className="text-white/80">{signatoryName}</strong>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear drawing"
                onClick={() => { signatureRef.current?.clear(); setHasDrawing(false); setDraftDataUrl(null); }}
                className="h-11 w-11 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1 flex-wrap bg-[#1c1c1e] border border-white/10 p-2 rounded-xl">
              <span className="text-sm text-white/60 px-1" id="signature-color-label">Color:</span>
              <div className="flex flex-wrap" role="group" aria-labelledby="signature-color-label">
                {SIGNATURE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    aria-label={color.name}
                    aria-pressed={selectedColor === color.value}
                    className="inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    onClick={() => setSelectedColor(color.value)}
                  >
                    <span
                      className={cn('h-6 w-6 rounded-full border-2', selectedColor === color.value ? 'border-white' : 'border-transparent')}
                      style={{ backgroundColor: color.value }}
                    />
                  </button>
                ))}
              </div>
              {signingTool === 'text' && (
                <>
                  <span className="text-sm ml-2 text-white/60">Font:</span>
                  <Select value={selectedFont} onValueChange={setSelectedFont}>
                    <SelectTrigger className="w-[140px] bg-[#2a2a2c] border-transparent text-white focus:ring-1 focus:ring-white/20 h-11 min-h-11">
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
              <Slider min={1} max={12} step={1} value={[selectedSize]} onValueChange={(v) => setSelectedSize(v[0])} className="flex-1 py-2 [&_[role=slider]]:h-11 [&_[role=slider]]:w-11" />
            </div>

            <div
              className="relative h-44 w-full shrink-0 overflow-hidden rounded-2xl border-2 border-white/10 bg-white shadow-inner sm:h-56"
              onPointerUp={() => { window.setTimeout(syncDrawing, 0); }}
              onKeyUp={syncDrawing}
            >
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

          <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 px-4 pb-4 pt-3">
            {hint ? (
              <p id="draw-submit-hint" role="status" className="text-center text-sm text-white/80 break-words">{hint}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="ghost" onClick={handleCancelDraw} className="min-h-11 text-white hover:bg-white/10 hover:text-white rounded-full">Cancel</Button>
              <Button type="button" variant="ghost" onClick={handlePlaceOnShirt} className="min-h-11 rounded-full border border-white/15 px-3 text-white hover:bg-white/10 hover:text-white">
                Place on Shirt
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={submitDisabled} aria-describedby={hint ? 'draw-submit-hint' : undefined} className="col-span-2 min-h-11 bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Done & Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Spot Taken Error Modal */}
      <Dialog open={showSpotTakenError} onOpenChange={setShowSpotTakenError}>
        <DialogContent 
          overlayClassName="z-[9998]"
          className="sm:max-w-[400px] w-[calc(100%-2rem)] bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl z-[9999]"
        >
          <DialogHeader className="pb-2 border-b border-white/5 pr-12">
            <DialogTitle className="text-xl font-bold font-headline text-red-500 flex items-center gap-2">
              Spot Taken
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="py-6 text-sm text-white/80 block">
            This spot has already been taken by another signature. Please choose another spot on the shirt!
          </DialogDescription>
          <DialogFooter className="pt-2 border-t border-white/5">
            <Button 
              type="button"
              onClick={() => setShowSpotTakenError(false)} 
              className="min-h-11 bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium w-full sm:w-auto"
            >
              Okay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}