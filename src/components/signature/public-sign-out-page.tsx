"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExistingSignature } from "@/components/3d/TShirtCanvas";
import type { SignaturePlacementPayload } from "@/components/3d/TShirtSigningModal";
import TurnstileWidget from "@/components/contact/turnstile-widget";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SIGNATURE_POLL_MS,
  SIGNATURE_REFRESH_DEBOUNCE_MS,
  mapSignaturesPublic,
  signatureChannelFailed,
  signatureDetail,
  type PublicSignature,
} from "@/lib/public/board-signatures";
import {
  clearEditsClosed,
  clearOwnSignature,
  readEditsClosed,
  readOwnSignature,
  saveEditsClosed,
  saveOwnSignature,
  type OwnSignature,
} from "@/lib/public/own-signature";
import {
  EDITS_CLOSED_COPY,
  HIDE_UPDATE_FAILED_COPY,
  deleteOwnSignature,
  patchOwnSignature,
} from "@/lib/public/signature-writes";
import {
  ALREADY_SIGNED_COPY,
  SignatureFlowError,
  TURNSTILE_BEFORE_DRAW_COPY,
  classifySignatureFailure,
  fetchAlreadySigned,
  fetchTurnstileRequired,
  signatureErrorMessage,
} from "@/lib/public/signing-flow";
import type { PublicStudent } from "@/lib/public/student-public";
import { signInAnonymously, supabase } from "@/supabase";
import { Info, Loader2, MessageSquare } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import InstructionDialog from "./instruction-dialog";
import ThankYouDialog from "./thank-you-dialog";

const TShirtSigningModal = dynamic(
  () => import("@/components/3d/TShirtSigningModal"),
  { ssr: false, loading: () => null }
);

const TShirtBoard = dynamic(
  () => import("@/components/3d/TShirtBoard"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    ),
  }
);

async function ensureAccessToken(): Promise<string | null> {
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.access_token) return existing.data.session.access_token;
  try {
    await signInAnonymously(null);
  } catch (error) {
    console.warn("Anonymous sign-in failed:", error);
    return null;
  }
  const next = await supabase.auth.getSession();
  return next.data.session?.access_token ?? null;
}

export default function PublicSignOutPage({
  studentId,
  initialStudent,
  initialSignatures,
  studentLookupFailed,
}: {
  studentId: string;
  initialStudent: PublicStudent | null;
  initialSignatures: PublicSignature[];
  studentLookupFailed: boolean;
}) {
  const { toast } = useToast();
  const student = initialStudent;

  const [signatures, setSignatures] = useState<PublicSignature[]>(initialSignatures);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [showInstructionDialog, setShowInstructionDialog] = useState(false);
  const [tapped, setTapped] = useState<{ signature: ExistingSignature; x: number; y: number } | null>(null);

  const [infoOpen, setInfoOpen] = useState(false);
  const [sigName, setSigName] = useState("");
  const [sigNote, setSigNote] = useState("");
  const [onlyGraduate, setOnlyGraduate] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [sessionAlreadySigned, setSessionAlreadySigned] = useState(false);
  const [isCheckingChallenge, setIsCheckingChallenge] = useState(false);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [ownSignature, setOwnSignature] = useState<OwnSignature | null>(null);
  const [editsClosed, setEditsClosed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPrivate, setEditPrivate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setOwnSignature(readOwnSignature(sessionStorage, studentId));
    setEditsClosed(readEditsClosed(sessionStorage, studentId));
  }, [studentId]);

  const closeEdits = useCallback(() => {
    saveEditsClosed(sessionStorage, studentId);
    setEditsClosed(true);
    setEditOpen(false);
    toast({ title: EDITS_CLOSED_COPY });
  }, [studentId, toast]);

  const handleTurnstile = useCallback((token: string | null) => {
    setTurnstileToken(token ?? "");
  }, []);

  const refreshSignatures = useCallback(async () => {
    try {
      const response = await fetch(`/api/boards/${studentId}/signatures`);
      if (!response.ok) return;
      const body: unknown = await response.json();
      setSignatures(mapSignaturesPublic(body));
    } catch (error) {
      console.error("Failed to refresh board signatures:", error);
    }
  }, [studentId]);

  useEffect(() => {
    setShowInstructionDialog(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await ensureAccessToken();
      if (!token || cancelled) return;
      const signed = await fetchAlreadySigned(studentId, token);
      if (!cancelled) setSessionAlreadySigned(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  const refreshRef = useRef(refreshSignatures);
  refreshRef.current = refreshSignatures;

  useEffect(() => {
    if (!student) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: number | null = null;
    let refreshTimer: number | null = null;

    const stopPoll = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const clearRefresh = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const scheduleRefresh = () => {
      clearRefresh();
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshRef.current();
      }, SIGNATURE_REFRESH_DEBOUNCE_MS);
    };

    const startPoll = () => {
      if (pollTimer !== null) return;
      void refreshRef.current();
      pollTimer = window.setInterval(() => {
        void refreshRef.current();
      }, SIGNATURE_POLL_MS);
    };

    const subscribe = () => {
      const previous = channel;
      channel = null;
      if (previous) supabase.removeChannel(previous);
      stopPoll();

      const active = supabase
        .channel(`board-signatures-${studentId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "signatures",
            filter: `studentId=eq.${studentId}`,
          },
          () => {
            scheduleRefresh();
          }
        )
        .subscribe((status) => {
          if (channel !== active) return;
          if (!signatureChannelFailed(status)) return;
          channel = null;
          supabase.removeChannel(active);
          startPoll();
        });
      channel = active;
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        const previous = channel;
        channel = null;
        if (previous) supabase.removeChannel(previous);
        stopPoll();
        clearRefresh();
        return;
      }
      scheduleRefresh();
      subscribe();
    };

    if (document.visibilityState === "visible") subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      const previous = channel;
      channel = null;
      if (previous) supabase.removeChannel(previous);
      stopPoll();
      clearRefresh();
    };
  }, [student, studentId]);

  const refreshChallenge = async () => {
    setIsCheckingChallenge(true);
    try {
      const required = await fetchTurnstileRequired(studentId);
      setChallengeRequired(required);
      if (!required) setTurnstileToken("");
    } finally {
      setIsCheckingChallenge(false);
    }
  };

  const handleOpenInfo = () => {
    if (sessionAlreadySigned) {
      toast({ title: ALREADY_SIGNED_COPY });
      return;
    }
    setInfoOpen(true);
    void refreshChallenge();
  };

  const handleContinue = () => {
    if (!sigName.trim() || !sigNote.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in your name and note.",
      });
      return;
    }
    if (challengeRequired && !turnstileToken) return;
    setInfoOpen(false);
    setShowModal(true);
  };

  const canEditTapped =
    !!tapped?.signature.id &&
    ownSignature?.id === tapped.signature.id &&
    !editsClosed;

  const openEdit = () => {
    if (!ownSignature) return;
    setEditName(ownSignature.signatoryName);
    setEditNote(ownSignature.signatoryNote);
    setEditPrivate(ownSignature.privateBySigner);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!ownSignature) return;
    if (!editName.trim() || !editNote.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in your name and note.",
      });
      return;
    }
    setIsEditing(true);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        toast({ variant: "destructive", title: HIDE_UPDATE_FAILED_COPY });
        return;
      }
      const result = await patchOwnSignature(ownSignature.id, {
        signatoryName: editName.trim(),
        signatoryNote: editNote.trim(),
        privateBySigner: editPrivate,
      }, token);
      if (!result.ok) {
        if (result.closed) closeEdits();
        else toast({ variant: "destructive", title: HIDE_UPDATE_FAILED_COPY });
        return;
      }
      const saved: OwnSignature = {
        ...ownSignature,
        signatoryName: editName.trim(),
        signatoryNote: editNote.trim(),
        privateBySigner: editPrivate,
      };
      saveOwnSignature(sessionStorage, studentId, saved);
      setOwnSignature(saved);
      setEditOpen(false);
      void refreshSignatures();
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteOwn = async () => {
    if (!ownSignature) return;
    if (!window.confirm("Delete your signature?")) return;
    setIsEditing(true);
    try {
      const token = await ensureAccessToken();
      if (!token) {
        toast({ variant: "destructive", title: HIDE_UPDATE_FAILED_COPY });
        return;
      }
      const result = await deleteOwnSignature(ownSignature.id, token);
      if (!result.ok) {
        if (result.closed) closeEdits();
        else toast({ variant: "destructive", title: HIDE_UPDATE_FAILED_COPY });
        return;
      }
      clearOwnSignature(sessionStorage, studentId);
      clearEditsClosed(sessionStorage, studentId);
      setOwnSignature(null);
      setEditsClosed(false);
      setTapped(null);
      void refreshSignatures();
    } finally {
      setIsEditing(false);
    }
  };

  const handleSave = async (placement: SignaturePlacementPayload) => {
    if (!student) return;
    setIsSubmitting(true);
    try {
      const idToken = await ensureAccessToken();
      if (!idToken) {
        throw new Error("We couldn't confirm your session. Refresh the page and try again.");
      }

      const response = await fetch("/api/signatures", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          studentId: student.id,
          signatureImageUrl: placement.signatureImageUrl,
          signatoryName: sigName.trim(),
          signatoryNote: sigNote.trim(),
          position: placement.position,
          privateBySigner: onlyGraduate,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        signature_id?: string;
      };
      if (!response.ok) {
        const flow = classifySignatureFailure(response.status, result.error);
        if (flow?.code === "already_signed") {
          setSessionAlreadySigned(true);
          toast({ title: ALREADY_SIGNED_COPY });
          throw flow;
        }
        if (flow?.code === "challenge_required") {
          setChallengeRequired(true);
          setTurnstileToken("");
          setInfoOpen(true);
          throw flow;
        }
        throw new Error(signatureErrorMessage(response.status, result.error));
      }

      if (result.signature_id) {
        const saved: OwnSignature = {
          id: result.signature_id,
          signatoryName: sigName.trim(),
          signatoryNote: sigNote.trim(),
          privateBySigner: onlyGraduate,
        };
        saveOwnSignature(sessionStorage, studentId, saved);
        clearEditsClosed(sessionStorage, studentId);
        setOwnSignature(saved);
        setEditsClosed(false);
      }
      setSigName("");
      setSigNote("");
      setOnlyGraduate(false);
      setTurnstileToken("");
      setChallengeRequired(false);
      setShowModal(false);
      setShowThankYou(true);
      void refreshSignatures();
    } catch (err: unknown) {
      if (err instanceof SignatureFlowError) throw err;
      const message = err instanceof Error ? err.message : "We couldn't save your signature. Please try again.";
      toast({ variant: "destructive", title: "Submission Failed", description: message });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  if (studentLookupFailed || !student) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-black px-6 text-center text-white">
        <h1 className="font-headline text-3xl font-semibold tracking-tight">We couldn&apos;t load this shirt</h1>
        <p className="mt-3 max-w-md text-sm text-white/60">
          Something went wrong while opening this board. Please try again in a moment.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black"
        >
          Go to Signpen home
        </Link>
      </div>
    );
  }

  const heading = student.pageSettings.pageHeading || student.name || "Sign this shirt";
  const existingSignatures: ExistingSignature[] = signatures.map((signature) => ({
    id: signature.id,
    signatureImageUrl: signature.signatureImageUrl,
    position: signature.position,
    name: signature.signatoryName,
    note: signature.isPrivate ? undefined : signature.signatoryNote ?? undefined,
    isPrivate: signature.isPrivate,
  }));
  const tappedDetail = tapped
    ? signatureDetail(
        {
          signatoryName: tapped.signature.name ?? "",
          signatoryNote: tapped.signature.note ?? null,
          isPrivate: tapped.signature.isPrivate === true,
        },
        student.name
      )
    : null;

  const headerContent = (
    <div className="flex flex-col items-center lg:items-start w-full pointer-events-auto">
      <div className="flex items-center gap-3 lg:gap-4 mb-2 lg:mb-4">
        <Avatar className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 border-2 border-white/20 shadow-2xl shrink-0">
          <AvatarImage src={student.profilePhotoUrl} />
          <AvatarFallback className="bg-[#1c1c1e] text-white/60 text-lg lg:text-xl">{(student.name || "?").charAt(0)}</AvatarFallback>
        </Avatar>

        <h2 className="text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white font-headline leading-tight drop-shadow-lg text-left">
          {heading}
        </h2>
      </div>

      <p className="text-sm md:text-xl lg:text-2xl text-white/80 lg:text-white/60 mt-1 lg:mt-2 lg:mb-8 drop-shadow-lg max-w-sm lg:max-w-none text-center lg:text-left">
        {student.pageSettings.pageSubheading}
      </p>
    </div>
  );

  const ctaContent = (
    <div className="space-y-2 lg:space-y-4 w-full sm:w-auto pointer-events-auto flex flex-col items-center lg:items-start">
      <Button
        size="lg"
        className="bg-white text-black hover:bg-gray-200 rounded-full w-full sm:w-auto px-8 lg:px-10 h-12 lg:h-14 text-base lg:text-lg font-medium shadow-xl transition-all"
        disabled={isSubmitting}
        onClick={handleOpenInfo}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 lg:h-5 w-4 lg:w-5 animate-spin text-black" />}
        Leave Your Signature
      </Button>

      <p className="text-xs lg:text-sm text-white/60 lg:text-white/40 flex items-center justify-center lg:justify-start gap-1.5 drop-shadow-lg">
        <Info className="h-3 lg:h-4 w-3 lg:w-4" /> To prevent spam, you can only sign a board once.
      </p>
    </div>
  );

  return (
    <div className="absolute inset-0 bg-black text-white font-sans overflow-hidden px-4 md:px-8 selection:bg-white/20 flex flex-col z-0 h-[100dvh]">
      <InstructionDialog open={showInstructionDialog} onOpenChange={setShowInstructionDialog} />

      <div className="absolute top-4 right-4 z-50 pointer-events-auto">
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1c1c1e]/90 hover:bg-white/10 border border-white/10 text-xs md:text-sm text-white transition-all font-medium backdrop-blur-md shadow-lg"
        >
          <MessageSquare className="h-4 w-4 text-white/70" />
          Contact & Feedback
        </Link>
      </div>

      {student.pageSettings.backgroundImageUrl && (
        <div className="absolute inset-0 z-0 opacity-15">
          <img src={student.pageSettings.backgroundImageUrl} alt="background" className="w-full h-full object-cover blur-sm" />
        </div>
      )}

      <div className="w-full max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row flex-1 h-full min-h-0 overflow-hidden py-4 lg:py-12">
        <div className="w-full lg:hidden shrink-0 z-20 px-2 mb-2">
          {headerContent}
        </div>

        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center order-2 lg:order-1 relative z-0 flex-1 min-h-0 h-full">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] lg:w-[80vw] lg:h-[80vw] max-w-[1200px] max-h-[1200px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.12)_0%,_transparent_60%)] pointer-events-none -z-10"></div>

          <div className="w-full h-full relative z-10 flex items-center justify-center">
            <TShirtBoard
              existingSignatures={existingSignatures}
              onSignatureTap={(signature, x, y) => setTapped({ signature, x, y })}
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <div className="w-full lg:hidden shrink-0 z-20 pt-2 pb-4 px-2">
          {ctaContent}
        </div>

        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-start text-left order-2 z-20 h-full pl-8 space-y-8">
          {headerContent}
          {ctaContent}
        </div>
      </div>

      {tapped && tappedDetail && (
        <div
          className="fixed z-50 bg-white/95 text-black p-3.5 rounded-xl shadow-2xl max-w-[250px] border border-black/5"
          style={{ left: tapped.x, top: tapped.y, transform: "translate(-50%, calc(-100% - 16px))" }}
        >
          <div className="font-bold text-[15px] leading-tight">{tappedDetail.name}</div>
          {tappedDetail.text && (
            <div className="text-sm text-gray-700 mt-2 leading-snug break-words">{tappedDetail.text}</div>
          )}
          {canEditTapped && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="text-xs font-semibold underline"
                onClick={openEdit}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-xs font-semibold underline"
                disabled={isEditing}
                onClick={() => void handleDeleteOwn()}
              >
                Delete
              </button>
            </div>
          )}
          <button
            type="button"
            className="mt-2 text-xs font-medium text-black/60 underline"
            onClick={() => setTapped(null)}
          >
            Close
          </button>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-sm bg-[#121212] border border-white/10 text-white rounded-[1.5rem] shadow-2xl p-4 sm:p-6">
          <DialogHeader className="pb-4 border-b border-white/5">
            <DialogTitle className="text-xl font-semibold tracking-tight">Edit your signature</DialogTitle>
            <DialogDescription className="text-sm text-white/60">
              You can change this for 24 hours after signing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/70">Your Name</Label>
              <Input
                value={editName}
                maxLength={80}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-[#1c1c1e] border-transparent text-white rounded-xl h-12 px-4"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Your Note</Label>
              <Input
                value={editNote}
                maxLength={1000}
                onChange={(e) => setEditNote(e.target.value)}
                className="bg-[#1c1c1e] border-transparent text-white rounded-xl h-12 px-4"
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={editPrivate}
                onChange={(e) => setEditPrivate(e.target.checked)}
                className="mt-1 h-4 w-4 accent-white"
              />
              <span>Only the graduate sees this</span>
            </label>
          </div>
          <DialogFooter className="gap-2 pt-4 border-t border-white/5">
            <DialogClose asChild>
              <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white rounded-full">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => void handleEditSave()}
              disabled={isEditing}
              className="bg-white text-black hover:bg-gray-200 rounded-full px-6"
            >
              {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-sm max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 bg-[#121212] border border-white/10 text-white rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl p-4 sm:p-6 overflow-hidden">
          <DialogHeader className="pb-4 border-b border-white/5 flex-shrink-0">
            <DialogTitle className="text-xl font-semibold tracking-tight">Before you sign</DialogTitle>
            <DialogDescription className="text-sm text-white/60">
              Please enter your name and a short message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-grow pr-1">
            <div className="space-y-2">
              <Label className="text-white/70">Your Name</Label>
              <Input
                placeholder="Jane Doe"
                value={sigName}
                maxLength={80}
                onChange={(e) => setSigName(e.target.value)}
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Your Note</Label>
              <Input
                placeholder="Wishing you all the best!"
                value={sigNote}
                maxLength={1000}
                onChange={(e) => setSigNote(e.target.value)}
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={onlyGraduate}
                onChange={(e) => setOnlyGraduate(e.target.checked)}
                className="mt-1 h-4 w-4 accent-white"
              />
              <span>Only the graduate sees this</span>
            </label>
            {challengeRequired && (
              <div className="space-y-2">
                <p className="text-sm text-white/80">{TURNSTILE_BEFORE_DRAW_COPY}</p>
                <TurnstileWidget
                  onToken={handleTurnstile}
                  unavailableMessage="This check is unavailable right now, so signing from a busy network has to wait."
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-white/5 flex-shrink-0 flex flex-col sm:flex-row justify-end">
            <DialogClose asChild>
              <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white rounded-full">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleContinue}
              disabled={isCheckingChallenge || (challengeRequired && !turnstileToken)}
              className="bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium"
            >
              {isCheckingChallenge && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {challengeRequired ? "Continue" : "Open T-Shirt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showModal && (
        <TShirtSigningModal
          open={showModal}
          onOpenChange={setShowModal}
          onSave={handleSave}
          signatoryName={sigName}
          existingSignatures={existingSignatures}
        />
      )}

      <ThankYouDialog open={showThankYou} onOpenChange={setShowThankYou} student={student} />
    </div>
  );
}
