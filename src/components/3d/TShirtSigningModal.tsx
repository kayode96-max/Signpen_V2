'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  Pen,
  Type,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/signature/signature-canvas';
import TurnstileWidget from '@/components/contact/turnstile-widget';
import { cn } from '@/lib/utils';
import { SIGNATORY_NAME_MAX, SIGNATORY_NOTE_MAX } from '@/lib/security/limits';
import { SHIRT_MODEL_URL } from '@/lib/shirt/asset';
import { formatDownloadLabel, readResponseBytes } from '@/lib/shirt/bytes';
import { initialShirtLoadState, reduceShirtLoad, SHIRT_LOAD_TIMEOUT_MS } from '@/lib/shirt/load-state';
import { renderKeepsakeDataUrl } from '@/lib/shirt/keepsake';
import { shouldMountSigningCanvas } from '@/lib/shirt/place-step';
import { percentToUv, suggestFreeSpot, uvToPercent, type ShirtPoint } from '@/lib/shirt/spot';
import { placeShirtWhileOpen, type PlaceShirt } from '@/lib/shirt/place-step';
import {
  AUTO_SPOT_HINT,
  CHALLENGE_HINT,
  MOVE_SPOT_HINT,
  SHIRT_HINT_DRAW_AND_SPOT,
  SHIRT_HINT_SPOT,
  SHIRT_HINT_SPOT_TAKEN,
  decideDetailsContinue,
  decideDrawContinue,
  decideShirtSubmit,
  noteCounterLabel,
  privateNoteLabel,
  shirtSubmitDisabled,
} from '@/lib/signing/signer-ui';
import FlatShirt from './FlatShirt';
import { signerBusyness, type SignerBusyness } from '@/lib/shirt/board-swap';
import type { TShirtCanvasRef, ExistingSignature } from './TShirtCanvas';

const TShirtCanvas = dynamic(() => import('./TShirtCanvas'), { ssr: false });

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

type Stage = 'draw' | 'details' | 'shirt';

interface TShirtSigningModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (payload: SignaturePlacementPayload) => Promise<void>;
  /** PNG of the shirt after the signature is on it, for the thank-you save action. */
  onScreenshot?: (dataUrl: string) => void;
  signatoryName: string;
  onSignatoryNameChange: (value: string) => void;
  signatoryNote: string;
  onSignatoryNoteChange: (value: string) => void;
  onlyGraduate: boolean;
  onOnlyGraduateChange: (value: boolean) => void;
  graduateName: string;
  challengeRequired: boolean;
  turnstileSiteKey: string;
  turnstileToken: string | null;
  onTurnstileToken: (token: string | null) => void;
  /** Lets the public board hold its 3D swap while this dialog is in use. */
  onSignerActivity?: (activity: SignerBusyness) => void;
  existingSignatures?: ExistingSignature[];
}

function placementKey(position: ShirtPoint, imageUrl: string): string {
  return `${position.x},${position.y},${imageUrl.length}`;
}

function occupiedSpots(signatures: ExistingSignature[] | undefined): ShirtPoint[] {
  const spots: ShirtPoint[] = [];
  for (const signature of signatures ?? []) {
    const position = signature?.position;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
    spots.push(position);
  }
  return spots;
}

export default function TShirtSigningModal({
  open,
  onOpenChange,
  onSave,
  onScreenshot,
  signatoryName,
  onSignatoryNameChange,
  signatoryNote,
  onSignatoryNoteChange,
  onlyGraduate,
  onOnlyGraduateChange,
  graduateName,
  challengeRequired,
  turnstileSiteKey,
  turnstileToken,
  onTurnstileToken,
  onSignerActivity,
  existingSignatures,
}: TShirtSigningModalProps): JSX.Element {
  const shirtRef = useRef<TShirtCanvasRef>(null);
  const signatureRef = useRef<SignatureCanvasRef>(null);
  const bakedKey = useRef('');
  const gotBytes = useRef(false);

  const [stage, setStage] = useState<Stage>('draw');
  const [placeOpenedAs, setPlaceOpenedAs] = useState<PlaceShirt | null>(null);
  const [nameFieldFocused, setNameFieldFocused] = useState(false);
  const [noteFieldFocused, setNoteFieldFocused] = useState(false);
  const onSignerActivityRef = useRef(onSignerActivity);
  onSignerActivityRef.current = onSignerActivity;
  const [load, setLoad] = useState(initialShirtLoadState);
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);
  const [hint, setHint] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUV, setPendingUV] = useState<{ x: number; y: number } | null>(null);
  const [manualUV, setManualUV] = useState<{ x: number; y: number } | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<SignaturePlacementPayload | null>(null);
  const [draftDataUrl, setDraftDataUrl] = useState<string | null>(null);
  const [showSpotTakenError, setShowSpotTakenError] = useState(false);

  const [signingTool, setSigningTool] = useState<'pen' | 'text'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>(SIGNATURE_COLORS[0].value);
  const [selectedFont, setSelectedFont] = useState(fonts[0].className);
  const [selectedSize, setSelectedSize] = useState(4);

  const challengeBlocked = challengeRequired && Boolean(turnstileSiteKey) && !turnstileToken;

  useEffect(() => {
    onSignerActivityRef.current?.(signerBusyness({
      modalOpen: open,
      stage,
      nameFieldFocused,
      noteFieldFocused,
    }));
  }, [open, stage, nameFieldFocused, noteFieldFocused]);

  useEffect(() => {
    if (!challengeBlocked || stage !== 'shirt') return;
    setHint(CHALLENGE_HINT);
    setStage('details');
  }, [challengeBlocked, stage]);
  const submitDisabled = shirtSubmitDisabled(isSaving);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    gotBytes.current = false;
    setLoad((state) => reduceShirtLoad(state, { type: 'start' }));
    const timer = window.setTimeout(() => {
      if (gotBytes.current) return;
      controller.abort();
      setLoad((state) => reduceShirtLoad(state, { type: 'timeout' }));
    }, SHIRT_LOAD_TIMEOUT_MS);

    void (async () => {
      try {
        const response = await fetch(SHIRT_MODEL_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`Shirt download failed (${response.status})`);
        const buffer = await readResponseBytes(response, (loadedBytes, totalBytes) => {
          if (cancelled) return;
          setLoad((state) => reduceShirtLoad(state, { type: 'progress', loadedBytes, totalBytes }));
        });
        if (cancelled) return;
        gotBytes.current = true;
        setModelBuffer(buffer);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        setLoad((state) => reduceShirtLoad(state, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Could not download the 3D shirt.',
        }));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, load.attempt]);

  const placeView = stage === 'shirt' && placeOpenedAs ? placeShirtWhileOpen(placeOpenedAs) : 'flat';
  const showPlace3d = stage === 'shirt' && placeView === '3d';
  const mountCanvas = shouldMountSigningCanvas(showPlace3d ? '3d' : 'flat') && Boolean(modelBuffer) && load.phase !== 'fallback';

  useEffect(() => {
    if (!mountCanvas || load.phase !== 'loading') return;
    const timer = window.setTimeout(() => {
      setLoad((state) => reduceShirtLoad(state, { type: 'timeout' }));
    }, SHIRT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [mountCanvas, load.phase, load.attempt]);

  const dataUrlToCanvas = useCallback((dataUrl: string) => {
    return new Promise<HTMLCanvasElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }, []);

  const currentImage = useCallback(() => draftDataUrl, [draftDataUrl]);

  const bakeAt = useCallback(async (
    uv: { x: number; y: number },
    imageUrl: string | null,
  ): Promise<SignaturePlacementPayload | null> => {
    if (!imageUrl) {
      setHint('Draw your signature before placing it.');
      return null;
    }
    const position = uvToPercent(uv);
    const placement = { signatureImageUrl: imageUrl, position };
    setPendingPlacement(placement);
    setPendingUV(uv);
    setManualUV(null);
    const shirt = shirtRef.current;
    if (shirt && showPlace3d) {
      const canvas = await dataUrlToCanvas(imageUrl);
      if (canvas) {
        const accepted = shirt.addSignature(canvas, uv, { width: 320, height: 140 });
        if (accepted) bakedKey.current = placementKey(position, imageUrl);
      }
    }
    return placement;
  }, [dataUrlToCanvas, showPlace3d]);

  useEffect(() => {
    if (load.phase !== 'ready' || !pendingPlacement || !shirtRef.current) return;
    const key = placementKey(pendingPlacement.position, pendingPlacement.signatureImageUrl);
    if (bakedKey.current === key) return;
    const uv = percentToUv(pendingPlacement.position);
    let cancelled = false;
    void dataUrlToCanvas(pendingPlacement.signatureImageUrl).then((canvas) => {
      if (cancelled || !canvas || !shirtRef.current) return;
      const accepted = shirtRef.current.addSignature(canvas, uv, { width: 320, height: 140 });
      if (accepted) bakedKey.current = key;
      else setHint(SHIRT_HINT_SPOT_TAKEN);
    });
    return () => { cancelled = true; };
  }, [load.phase, pendingPlacement, dataUrlToCanvas]);

  const rememberDrawing = () => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      setDraftDataUrl(signatureRef.current.toDataURL());
    }
  };

  const handleContinueDraw = () => {
    const hasDrawing = signatureRef.current ? !signatureRef.current.isEmpty() : Boolean(draftDataUrl);
    const decision = decideDrawContinue(hasDrawing);
    if (decision.action === 'hint') {
      setHint(decision.hint);
      return;
    }
    rememberDrawing();
    setHint('');
    setStage('details');
  };

  const handleFindSpot = async () => {
    const imageUrl = currentImage();
    const decision = decideDetailsContinue({
      hasDrawing: Boolean(imageUrl),
      name: signatoryName,
      note: signatoryNote,
      challengeBlocked,
    });
    if (decision.action === 'hint') {
      setHint(decision.hint);
      return;
    }
    const spot = suggestFreeSpot(occupiedSpots(existingSignatures));
    const openPlaceStep = () => {
      // Signing never starts WebGL. Parsing the shirt while typing or placing
      // blocks the next tap, so Place stays on the flat shirt.
      setPlaceOpenedAs('flat');
      setStage('shirt');
    };
    if (!spot) {
      setHint(SHIRT_HINT_SPOT_TAKEN);
      openPlaceStep();
      return;
    }
    const placement = await bakeAt(percentToUv(spot), imageUrl);
    openPlaceStep();
    if (placement) setHint(AUTO_SPOT_HINT);
  };

  const handlePlaceOnShirt = async () => {
    if (!currentImage()) {
      setHint('Draw your signature before placing it.');
      return;
    }
    if (!manualUV) {
      setHint(MOVE_SPOT_HINT);
      return;
    }
    const placement = await bakeAt(manualUV, currentImage());
    if (placement) setHint('Signature moved. Tap Done & Submit to save.');
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    if (challengeBlocked) {
      setHint(CHALLENGE_HINT);
      setStage('details');
      return;
    }
    const liveDrawing = Boolean(draftDataUrl) || (signatureRef.current ? !signatureRef.current.isEmpty() : false);
    const decision = decideShirtSubmit({
      hasPlacement: Boolean(pendingPlacement),
      hasDrawing: liveDrawing || Boolean(draftDataUrl),
      hasSpot: Boolean(manualUV || pendingUV),
    });
    if (decision.action === 'hint') {
      setHint(decision.hint);
      return;
    }
    let placement = pendingPlacement;
    if (decision.action === 'place-then-submit') {
      const uv = manualUV || pendingUV;
      if (!uv) {
        setHint(SHIRT_HINT_SPOT);
        return;
      }
      placement = await bakeAt(uv, currentImage());
      if (!placement) return;
    }
    if (!placement) {
      setHint(SHIRT_HINT_DRAW_AND_SPOT);
      return;
    }
    setHint('');
    setIsSaving(true);
    try {
      const marks = (existingSignatures ?? [])
        .filter((signature) => signature.signatureImageUrl && signature.position)
        .map((signature) => ({
          imageUrl: signature.signatureImageUrl,
          position: signature.position,
        }));
      marks.push({
        imageUrl: placement.signatureImageUrl,
        position: placement.position,
      });
      const picture = await renderKeepsakeDataUrl({ graduateName, marks });
      if (picture) onScreenshot?.(picture);
      await onSave(placement);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const chooseSpot = (uv: { x: number; y: number }) => {
    setManualUV(uv);
    setHint('Tap Place on Shirt to move your signature here.');
  };

  const title = stage === 'draw' ? 'Draw Your Signature' : stage === 'details' ? 'Add your name' : 'Sign the T-Shirt';
  const description = stage === 'draw'
    ? 'Draw with your finger. Next you will add your name, and we will find a free spot.'
    : stage === 'details'
      ? 'Your drawing is saved. Add your name and a note, then we will place it.'
      : pendingPlacement
        ? 'We picked a free spot. Place on Shirt if you want to move it, then submit.'
        : 'Tap the shirt to choose a spot. You can submit without the 3D view.';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-full max-w-[min(520px,calc(100vw-1rem))] flex-col gap-0 overflow-hidden border border-white/10 bg-[#121212] p-0 text-white shadow-2xl sm:max-w-[520px] sm:rounded-[2rem]">
          <DialogHeader className="shrink-0 border-b border-white/10 bg-[#121212] px-6 pb-4 pr-14 pt-6">
            <DialogTitle className="font-headline text-xl font-bold tracking-tight">{title}</DialogTitle>
            <DialogDescription className="text-white/60">{description}</DialogDescription>
          </DialogHeader>

          <div className={stage === 'draw' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#1c1c1e] p-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSigningTool('pen')} className={cn('min-h-11', signingTool === 'pen' ? 'bg-white/20 text-white hover:bg-white/20 hover:text-white' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
                  <Pen className="mr-2 h-4 w-4" /> Draw
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSigningTool('text')} className={cn('min-h-11', signingTool === 'text' ? 'bg-white/20 text-white hover:bg-white/20 hover:text-white' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
                  <Type className="mr-2 h-4 w-4" /> Text
                </Button>
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Clear drawing"
                  onClick={() => { signatureRef.current?.clear(); setDraftDataUrl(null); }}
                  className="h-11 w-11 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#1c1c1e] p-2">
                <span className="px-1 text-sm text-white/60" id="signature-color-label">Color:</span>
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
                    <span className="ml-2 text-sm text-white/60">Font:</span>
                    <Select value={selectedFont} onValueChange={setSelectedFont}>
                      <SelectTrigger aria-label="Signature font" className="h-11 min-h-11 w-[140px] border-transparent bg-[#2a2a2c] text-white focus:ring-1 focus:ring-white/20">
                        <SelectValue placeholder="Select font" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#1c1c1e] text-white">
                        {fonts.map((font) => (
                          <SelectItem key={font.className} value={font.className} className={`${font.className} cursor-pointer hover:bg-white/10 focus:bg-white/10 focus:text-white`}>
                            {font.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1c1c1e] px-4 py-3">
                <span className="shrink-0 text-sm text-white/60">Size:</span>
                <Slider min={1} max={12} step={1} value={[selectedSize]} onValueChange={(value) => setSelectedSize(value[0])} className="flex-1 py-2 [&_[role=slider]]:h-11 [&_[role=slider]]:w-11" />
              </div>

              <div
                data-testid="draw-pad"
                className="relative h-44 w-full shrink-0 overflow-hidden rounded-2xl border-2 border-white/10 bg-white shadow-inner sm:h-56"
              >
                <SignatureCanvas
                  ref={signatureRef}
                  tool={signingTool}
                  color={selectedColor}
                  font={selectedFont}
                  size={selectedSize}
                  className="h-full w-full"
                />
              </div>

              <p role="status" className="text-center text-xs text-white/60">
                {load.phase === 'loading'
                  ? formatDownloadLabel(load.loadedBytes, load.totalBytes)
                  : load.phase === 'fallback'
                    ? '3D shirt unavailable. You can still draw and place it on the flat shirt.'
                    : 'The shirt is ready when you are.'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 px-4 pb-4 pt-3">
              {hint ? <p id="draw-continue-hint" role="status" className="break-words text-center text-sm text-white/80">{hint}</p> : null}
              <Button type="button" onClick={handleContinueDraw} aria-describedby={hint ? 'draw-continue-hint' : undefined} className="min-h-11 rounded-full bg-white font-medium text-black hover:bg-gray-200">
                Next
              </Button>
            </div>
          </div>

          <div className={stage === 'details' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="signatory-name" className="text-white/80">Your Name</Label>
                <Input
                  id="signatory-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  value={signatoryName}
                  maxLength={SIGNATORY_NAME_MAX}
                  onChange={(event) => onSignatoryNameChange(event.target.value)}
                  onFocus={() => setNameFieldFocused(true)}
                  onBlur={() => setNameFieldFocused(false)}
                  className="h-12 rounded-xl border-transparent bg-[#1c1c1e] px-4 text-white transition-all placeholder:text-white/30 focus:border-white/20 focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signatory-note" className="text-white/80">Your Note</Label>
                <Textarea
                  id="signatory-note"
                  name="note"
                  rows={3}
                  placeholder="Wishing you all the best!"
                  value={signatoryNote}
                  maxLength={SIGNATORY_NOTE_MAX}
                  aria-describedby="signatory-note-count"
                  onChange={(event) => onSignatoryNoteChange(event.target.value)}
                  onFocus={() => setNoteFieldFocused(true)}
                  onBlur={() => setNoteFieldFocused(false)}
                  className="min-h-[4.5rem] rounded-xl border-transparent bg-[#1c1c1e] px-4 py-3 text-base text-white transition-all placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-white/20"
                />
                <p id="signatory-note-count" aria-live="polite" className="text-right text-xs tabular-nums text-white/50">
                  {noteCounterLabel(signatoryNote.length)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="private-note"
                  checked={onlyGraduate}
                  onCheckedChange={onOnlyGraduateChange}
                  aria-labelledby="private-note-label"
                  className="h-11 w-16 shrink-0 border-white/20 data-[state=checked]:bg-white data-[state=unchecked]:bg-white/20 [&>span]:h-8 [&>span]:w-8 [&>span]:data-[state=checked]:bg-black [&>span]:data-[state=unchecked]:bg-white [&>span]:data-[state=unchecked]:!translate-x-[2px] [&>span]:data-[state=checked]:!translate-x-[26px]"
                />
                <label
                  id="private-note-label"
                  className="cursor-pointer text-sm font-medium leading-snug text-white/80"
                  onClick={() => onOnlyGraduateChange(!onlyGraduate)}
                >
                  {privateNoteLabel(graduateName)}
                </label>
              </div>
              {challengeRequired && turnstileSiteKey ? (
                <TurnstileWidget onToken={onTurnstileToken} />
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 px-4 pb-4 pt-3">
              {hint ? <p id="details-continue-hint" role="status" className="break-words text-center text-sm text-white/80">{hint}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="ghost" onClick={() => { setHint(''); setPlaceOpenedAs(null); setStage('draw'); }} className="min-h-11 rounded-full text-white hover:bg-white/10 hover:text-white">
                  Back
                </Button>
                <Button type="button" onClick={() => { void handleFindSpot(); }} aria-describedby={hint ? 'details-continue-hint' : undefined} className="min-h-11 rounded-full bg-white font-medium text-black hover:bg-gray-200">
                  Find a spot
                </Button>
              </div>
            </div>
          </div>

          <div className={stage === 'shirt' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <div className="relative min-h-0 flex-1 bg-[#1a1a1a]">
              {mountCanvas ? (
                <div className="absolute inset-0 h-full w-full">
                  <TShirtCanvas
                    key={load.attempt}
                    ref={shirtRef}
                    modelBuffer={modelBuffer}
                    onShirtClick={chooseSpot}
                    onExistingSignatureClick={() => setShowSpotTakenError(true)}
                    existingSignatures={existingSignatures}
                    onReady={() => setLoad((state) => reduceShirtLoad(state, { type: 'ready' }))}
                    onModelError={(message) => setLoad((state) => reduceShirtLoad(state, { type: 'error', message }))}
                    className="h-full w-full"
                  />
                </div>
              ) : null}
              {stage === 'shirt' && !showPlace3d ? (
                <div className="absolute inset-0 z-10 flex flex-col bg-[#1a1a1a]">
                  <FlatShirt
                    existingSignatures={existingSignatures}
                    pending={pendingPlacement ? { imageUrl: pendingPlacement.signatureImageUrl, position: pendingPlacement.position } : null}
                    onSelect={(position) => chooseSpot(percentToUv(position))}
                    className="min-h-0 flex-1"
                  />
                </div>
              ) : null}
            </div>
            <div className="z-20 flex w-full shrink-0 flex-wrap justify-center gap-3 border-t border-white/10 bg-[#121212] px-4 pb-6 pt-3">
              {hint ? (
                <p id="shirt-submit-hint" role="status" className="w-full break-words text-center text-sm text-white/80">{hint}</p>
              ) : null}
              <Button type="button" size="sm" className={toolbarButtonClass} onClick={() => { shirtRef.current?.undoLast(); setPendingPlacement(null); setPendingUV(null); bakedKey.current = ''; }}>
                <Undo2 className="mr-2 h-4 w-4" /> Undo
              </Button>
              <Button type="button" size="sm" className={toolbarButtonClass} onClick={() => { shirtRef.current?.clearAll(); setPendingPlacement(null); setPendingUV(null); bakedKey.current = ''; setHint('Cleared.'); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear mine
              </Button>
              <Button type="button" size="sm" className={toolbarButtonClass} onClick={() => { void handlePlaceOnShirt(); }}>
                Place on Shirt
              </Button>
              <Button
                type="button"
                size="sm"
                className="min-h-11 rounded-full bg-white px-6 font-medium text-black shadow-sm hover:bg-gray-200"
                onClick={() => { void handleSubmit(); }}
                disabled={submitDisabled}
                aria-describedby={hint ? 'shirt-submit-hint' : undefined}
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Done & Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSpotTakenError} onOpenChange={setShowSpotTakenError}>
        <DialogContent
          overlayClassName="z-[9998]"
          className="z-[9999] w-[calc(100%-2rem)] rounded-[2rem] border border-white/10 bg-[#121212] text-white shadow-2xl sm:max-w-[400px]"
        >
          <DialogHeader className="border-b border-white/5 pb-2 pr-12">
            <DialogTitle className="flex items-center gap-2 font-headline text-xl font-bold text-red-500">
              Spot Taken
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="block py-6 text-sm text-white/80">
            This spot has already been taken by another signature. Please choose another spot on the shirt!
          </DialogDescription>
          <DialogFooter className="border-t border-white/5 pt-2">
            <Button
              type="button"
              onClick={() => setShowSpotTakenError(false)}
              className="min-h-11 w-full rounded-full bg-white px-6 font-medium text-black hover:bg-gray-200 sm:w-auto"
            >
              Okay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
