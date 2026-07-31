"use client";

import { useState, useMemo, useEffect } from "react";
import type { Student, Signature } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ThankYouDialog from "./thank-you-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Info } from "lucide-react";
import { useDoc, useCollection, initializeFirebase } from "@/firebase";
import { collection, doc, query, getDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { notFound, useParams } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import InstructionDialog from "./instruction-dialog";
import dynamic from "next/dynamic";
import type { ExistingSignature } from "@/components/3d/TShirtCanvas";
import type { SignaturePlacementPayload } from "@/components/3d/TShirtSigningModal";

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

const { firestore, auth } = initializeFirebase();

export default function PublicSignOutPage() {
  const { toast } = useToast();
  const params = useParams();
  const studentId = params.studentId as string;

  const studentDocRef = useMemo(
    () => (firestore ? doc(firestore, `students/${studentId}`) : null),
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
  const [showInstructionDialog, setShowInstructionDialog] = useState(false);

  // Pre-sign name + note dialog
  const [infoOpen, setInfoOpen] = useState(false);
  const [sigName, setSigName] = useState("");
  const [sigNote, setSigNote] = useState("");

  // 3-D modal
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { setShowInstructionDialog(true); }, []);

  useEffect(() => {
    const checkIp = async () => {
      setIsCheckingIp(true);
      try {
        const res = await fetch("/api/ip");
        const { ip } = await res.json();
        if (ip && firestore) {
          const ipDocRef = doc(firestore, `students/${studentId}/signedIps`, ip);
          const ipDoc = await getDoc(ipDocRef);
          if (ipDoc.exists()) setHasAlreadySigned(true);
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

  const handleOpenInfo = () => {
    if (hasAlreadySigned || isCheckingIp) return;
    setInfoOpen(true);
  };

  const handleOpenModal = () => {
    if (!sigName.trim() || !sigNote.trim()) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please fill in your name and note." });
      return;
    }
    setInfoOpen(false);
    setShowModal(true);
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
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Submission failed." }));
        throw new Error(payload.error || "Submission failed.");
      }

      setSigName("");
      setSigNote("");
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

  if (!student) notFound();

  const buttonDisabled = isCheckingIp || hasAlreadySigned || isSubmitting;
  const buttonText = isCheckingIp ? "Checking..." : hasAlreadySigned ? "You've Already Signed" : "Leave Your Signature";

  // Map Firestore signatures to ExistingSignature shape for the 3D canvas
  const existingSignatures: ExistingSignature[] = (signatures || []).map((s) => ({
    signatureImageUrl: s.signatureImageUrl,
    position: s.position,
  }));

  const headerContent = (
    <div className="flex flex-col items-center lg:items-start w-full pointer-events-auto">
      <div className="flex items-center gap-3 lg:gap-4 mb-2 lg:mb-4">
        <Avatar className="w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 border-2 border-white/20 shadow-2xl shrink-0">
          <AvatarImage src={student.profilePhotoUrl} />
          <AvatarFallback className="bg-[#1c1c1e] text-white/60 text-lg lg:text-xl">{student.name.charAt(0)}</AvatarFallback>
        </Avatar>
        
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white font-headline leading-tight drop-shadow-lg text-left">
          {student.pageSettings.pageHeading}
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
        disabled={buttonDisabled} 
        onClick={handleOpenInfo}
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
      <InstructionDialog open={showInstructionDialog} onOpenChange={setShowInstructionDialog} />

      {student.pageSettings.backgroundImageUrl && (
        <div className="absolute inset-0 z-0 opacity-15">
          <img src={student.pageSettings.backgroundImageUrl} alt="background" className="w-full h-full object-cover blur-sm" />
        </div>
      )}

      {/* Main Layout Wrapper */}
      <div className="w-full max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row flex-1 h-full min-h-0 overflow-hidden py-4 lg:py-12">
        
        {/* Mobile Header (Top) */}
        <div className="w-full lg:hidden shrink-0 z-20 px-2 mb-2">
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
              <TShirtBoard
                existingSignatures={existingSignatures}
                className="w-full h-full object-contain"
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

      {/* Name + Note dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-sm bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl">
          <DialogHeader className="pb-2 border-b border-white/5">
            <DialogTitle className="text-xl font-semibold tracking-tight">Before you sign</DialogTitle>
            <DialogDescription className="text-sm text-white/60">
              Please enter your name and a short message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/70">Your Name</Label>
              <Input 
                placeholder="Jane Doe" 
                value={sigName} 
                onChange={(e) => setSigName(e.target.value)} 
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Your Note</Label>
              <Input 
                placeholder="Wishing you all the best!" 
                value={sigNote} 
                onChange={(e) => setSigNote(e.target.value)} 
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-white/5">
            <DialogClose asChild>
                <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white rounded-full">Cancel</Button>
            </DialogClose>
            <Button onClick={handleOpenModal} className="bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium">Open T-Shirt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full 3-D signing modal */}
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