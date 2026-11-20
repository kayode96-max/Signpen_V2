"use client";

import { useState, useMemo, useEffect } from "react";
import type { Student, Signature } from "@/lib/types";
import { Button } from "@/components/ui/button";
import ThankYouDialog from "./thank-you-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Info, MessageSquare } from "lucide-react";
import { useDoc, useCollection, doc, collection, query, signInAnonymously, initializeFirebase, supabase } from "@/supabase";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import type { ExistingSignature } from "@/components/3d/TShirtCanvas";
import type { SignaturePlacementPayload } from "@/components/3d/TShirtSigningModal";
import type TShirtSigningModalComponent from "@/components/3d/TShirtSigningModal";
import DeferredPublicBoard from "@/components/3d/DeferredPublicBoard";
import { boardSwapAllowed, IDLE_SIGNER, type SignerBusyness } from "@/lib/shirt/board-swap";

const { firestore, auth } = initializeFirebase();

export default function PublicSignOutPage() {
  const { toast } = useToast();
  const params = useParams();
  const studentId = params.studentId as string;

  const studentDocRef = useMemo(
    () => (firestore ? doc(firestore, `publicStudents/${studentId}`) : null),
    [studentId]
  );
  const signaturesQuery = useMemo(
    () => (firestore ? query(collection(firestore, `students/${studentId}/signatures`)) : null),
    [studentId]
  );

  const { data: student, isLoading: isStudentLoading } = useDoc<Student>(studentDocRef);
  const { data: signatures, isLoading: areSignaturesLoading } = useCollection<Signature>(signaturesQuery);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [hasAlreadySigned, setHasAlreadySigned] = useState(false);
  const [isCheckingIp, setIsCheckingIp] = useState(true);
  const [sigName, setSigName] = useState("");
  const [sigNote, setSigNote] = useState("");
  const [onlyGraduate, setOnlyGraduate] = useState(false);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '';

  // Draw pad opens immediately. The board's 3D shirt waits, and it only
  // fades in once the pad, placement, and name/note fields are idle.
  const [showModal, setShowModal] = useState(false);
  const [thankYouPicture, setThankYouPicture] = useState("");
  const [SigningModal, setSigningModal] = useState<typeof TShirtSigningModalComponent | null>(null);
  const [signerActivity, setSignerActivity] = useState<SignerBusyness>(IDLE_SIGNER);

  useEffect(() => {
    const checkIp = async () => {
      setIsCheckingIp(true);
      try {
        // One signature per device session. A first visit has no session yet,
        // so there is nothing to check. Shared Wi-Fi does not block signing.
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/signatures?studentId=${encodeURIComponent(studentId)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { alreadySigned } = await res.json();
          if (alreadySigned) setHasAlreadySigned(true);
        }
      } catch (error) {
        console.error("IP check failed:", error);
      } finally {
        setIsCheckingIp(false);
      }
    };
    if (studentId && firestore) checkIp();
  }, [studentId]);

  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((error) => {
        console.warn("Anonymous sign-in failed:", error);
      });
    }
  }, []);

  useEffect(() => {
    // We force dark mode on the public page to ensure Dialogs inherit the dark theme correctly
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  const loadChallenge = async () => {
    try {
      const res = await fetch(`/api/signatures/challenge?studentId=${encodeURIComponent(studentId)}`);
      const data = await res.json().catch(() => ({}));
      if (data.enabled === false) {
        setChallengeRequired(false);
        return;
      }
      setChallengeRequired(data.challenge_required === true);
    } catch {
      setChallengeRequired(false);
    }
  };

  const handleOpenDraw = () => {
    if (hasAlreadySigned || isCheckingIp) return;
    setShowModal(true);
    void loadChallenge();
    if (!SigningModal) {
      // Prefetch stays off so the shirt model and three.js do not start during page load.
      void import("@/components/3d/TShirtSigningModal").then((mod) => {
        setSigningModal(() => mod.default);
      });
    }
  };

  const handleSave = async (payload: SignaturePlacementPayload) => {
    if (!firestore || !student) return;
    setIsSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Could not verify your session.");
      }

      const response = await fetch("/api/signatures", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          studentId: student.id,
          signatureImageUrl: payload.signatureImageUrl,
          signatoryName: sigName,
          signatoryNote: sigNote,
          position: payload.position,
          privateBySigner: onlyGraduate,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Submission failed." }));
        if (response.status === 409) setHasAlreadySigned(true);
        if (response.status === 429 && payload.error === "rate_limited") {
          throw new Error("Too many signatures from this network in the last hour. Please try again later.");
        }
        if (response.status === 429 && payload.error === "challenge_required") {
          setChallengeRequired(true);
          setTurnstileToken(null);
          throw new Error("Complete the spam check to keep signing from this network.");
        }
        throw new Error(payload.error || "Submission failed.");
      }

      setSigName("");
      setSigNote("");
      setOnlyGraduate(false);
      setHasAlreadySigned(true);
      setShowModal(false);
      setShowThankYou(true);
    } catch (err: any) {
      const message = err?.message || "An unexpected error occurred.";
      toast({ variant: "destructive", title: "Submission Failed", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isStudentLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="animate-spin h-8 w-8 text-white" />
      </div>
    );

  if (!student) {
    notFound();
    return null;
  }

  const buttonDisabled = isCheckingIp || hasAlreadySigned || isSubmitting;
  const buttonText = isCheckingIp ? "Checking..." : hasAlreadySigned ? "You've Already Signed" : "Leave Your Signature";

  // Map Firestore signatures to ExistingSignature shape for the 3D canvas
  const existingSignatures: ExistingSignature[] = (signatures || []).map((s) => ({
    signatureImageUrl: s.signatureImageUrl,
    position: s.position,
  }));

  const headerContent = (
    <div className="flex flex-col items-center lg:items-start w-full pointer-events-auto">
      <div className="flex w-full min-w-0 items-center gap-3 lg:gap-4 mb-2 lg:mb-4">
        <Avatar className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 border-2 border-white/20 shadow-2xl shrink-0">
          <AvatarImage src={student.profilePhotoUrl} />
          <AvatarFallback className="bg-[#1c1c1e] text-white/60 text-lg lg:text-xl">{student.name.charAt(0)}</AvatarFallback>
        </Avatar>
        
        <h2 className="min-w-0 break-words text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white font-headline leading-tight drop-shadow-lg text-left">
          {student.pageSettings.pageHeading}
        </h2>
      </div>
      
      <p className="text-sm md:text-xl lg:text-2xl text-white/80 lg:text-white/60 mt-1 lg:mt-2 drop-shadow-lg max-w-sm lg:max-w-none text-center lg:text-left">
        {student.pageSettings.pageSubheading}
      </p>
      <p className="mt-2 max-w-sm text-center text-sm text-white/70 lg:mb-8 lg:max-w-none lg:text-left">
        Draw your signature, add your name, and we will find a free spot.
      </p>
    </div>
  );

  const ctaContent = (
    <div className="space-y-2 lg:space-y-4 w-full sm:w-auto pointer-events-auto flex flex-col items-center lg:items-start">
      <Button 
        size="lg" 
        className="bg-white text-black hover:bg-gray-200 rounded-full w-full sm:w-auto px-8 lg:px-10 h-12 lg:h-14 text-base lg:text-lg font-medium shadow-xl transition-all" 
        disabled={buttonDisabled} 
        onClick={handleOpenDraw}
      >
        {(isCheckingIp || isSubmitting) && <Loader2 className="mr-2 h-4 lg:h-5 w-4 lg:w-5 animate-spin text-black" />}
        {buttonText}
      </Button>
      
      {!hasAlreadySigned && (
        <p className="text-xs lg:text-sm text-white/60 lg:text-white/40 flex items-center justify-center lg:justify-start gap-1.5 drop-shadow-lg">
          <Info className="h-3 lg:h-4 w-3 lg:w-4" /> To prevent spam, you can only sign a board once.
        </p>
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 bg-black text-white font-sans overflow-hidden px-4 md:px-8 selection:bg-white/20 flex flex-col z-0 h-[100dvh]">
      {/* Contact & Feedback. Icon only below 640px so it does not cover the heading. */}
      <div className="absolute top-4 right-4 z-50 pointer-events-auto">
        <Link 
          href="/contact" 
          aria-label="Contact & Feedback"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#1c1c1e]/90 text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:w-auto sm:gap-2 sm:px-4"
        >
          <MessageSquare className="h-4 w-4 shrink-0 text-white/70" aria-hidden="true" />
          <span className="hidden text-sm font-medium sm:inline">Contact & Feedback</span>
        </Link>
      </div>

      {student.pageSettings.backgroundImageUrl && (
        <div className="absolute inset-0 z-0 opacity-15">
          <img src={student.pageSettings.backgroundImageUrl} alt="background" className="w-full h-full object-cover blur-sm" />
        </div>
      )}

      {/* Main Layout Wrapper */}
      <div className="w-full max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row flex-1 h-full min-h-0 overflow-hidden py-4 lg:py-12">
        
        {/* Mobile Header (Top) */}
        <div className="mb-2 w-full min-w-0 shrink-0 z-20 pl-2 pr-16 sm:pr-56 lg:hidden">
          {headerContent}
        </div>

        {/* Canvas Area (Middle on mobile, Left on desktop) */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center order-2 lg:order-1 relative z-0 flex-1 min-h-0 h-full">
          
          {/* Spotlight */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[150vw] lg:w-[80vw] lg:h-[80vw] max-w-[1200px] max-h-[1200px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.12)_0%,_transparent_60%)] pointer-events-none -z-10"></div>
          
          <div className="w-full h-full relative z-10 flex items-center justify-center">
            {areSignaturesLoading ? (
              <Loader2 className="animate-spin text-white h-8 w-8" />
            ) : (
              <DeferredPublicBoard
                existingSignatures={existingSignatures}
                idle={boardSwapAllowed(signerActivity)}
              />
            )}
          </div>
        </div>

        {/* Mobile CTA (Bottom) */}
        <div className="w-full lg:hidden shrink-0 z-20 pt-2 pb-4 px-2">
          {ctaContent}
        </div>

        {/* Desktop Content Area (Right on desktop, hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-start text-left order-2 z-20 h-full pl-8 space-y-8">
          {headerContent}
          {ctaContent}
        </div>

      </div>

      {showModal && !SigningModal ? (
        <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 text-center text-sm text-white">
          Opening the drawing pad…
        </div>
      ) : null}
      {showModal && SigningModal && (
        <SigningModal
          open={showModal}
          onOpenChange={(open) => {
            setShowModal(open);
            if (!open) setSignerActivity(IDLE_SIGNER);
          }}
          onSignerActivity={setSignerActivity}
          onSave={handleSave}
          onScreenshot={setThankYouPicture}
          signatoryName={sigName}
          onSignatoryNameChange={setSigName}
          signatoryNote={sigNote}
          onSignatoryNoteChange={setSigNote}
          onlyGraduate={onlyGraduate}
          onOnlyGraduateChange={setOnlyGraduate}
          graduateName={student.name}
          challengeRequired={challengeRequired}
          turnstileSiteKey={turnstileSiteKey}
          turnstileToken={turnstileToken}
          onTurnstileToken={setTurnstileToken}
          existingSignatures={existingSignatures}
        />
      )}

      <ThankYouDialog open={showThankYou} onOpenChange={setShowThankYou} student={student} pictureUrl={thankYouPicture} />
    </div>
  );
}