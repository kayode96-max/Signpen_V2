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
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection, serverTimestamp, doc, query, getDoc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { notFound, useParams } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose,
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

const { firestore } = initializeFirebase();

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
    if (student?.pageSettings.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    return () => document.documentElement.classList.remove("dark");
  }, [student?.pageSettings.theme]);

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
      const ipRes = await fetch("/api/ip");
      const { ip } = await ipRes.json();
      if (!ip) throw new Error("Could not verify your request.");
      const ipDocRef = doc(firestore, `students/${student.id}/signedIps`, ip);
      const newSig: Omit<Signature, "id"> = {
        studentId: student.id,
        signatureImageUrl: payload.signatureImageUrl,
        signatoryName: sigName,
        signatoryNote: sigNote,
        position: payload.position,
        timestamp: serverTimestamp() as any,
      };
      await addDocumentNonBlocking(collection(firestore, `students/${student.id}/signatures`), newSig);
      await setDoc(ipDocRef, { signedAt: serverTimestamp() });
      setSigName("");
      setSigNote("");
      setHasAlreadySigned(true);
      setShowModal(false);
      setShowThankYou(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission Failed", description: err.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isStudentLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-secondary">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
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

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 relative min-h-screen flex flex-col">
      <InstructionDialog open={showInstructionDialog} onOpenChange={setShowInstructionDialog} />

      {student.pageSettings.backgroundImageUrl && (
        <div className="absolute inset-0 z-0 opacity-20">
          <img src={student.pageSettings.backgroundImageUrl} alt="background" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="w-full max-w-5xl mx-auto relative z-10 flex flex-col flex-1">

        {/* Header */}
        <div className="text-center mb-6">
          <Avatar className="w-24 h-24 mb-4 border-4 border-background shadow-md mx-auto">
            <AvatarImage src={student.profilePhotoUrl} />
            <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <h2 className="text-4xl font-bold font-headline">{student.pageSettings.pageHeading}</h2>
          <p className="text-xl text-muted-foreground mt-2">{student.pageSettings.pageSubheading}</p>
        </div>

        {/* CTA */}
        <div className="my-4 text-center space-y-2">
          <Button size="lg" className="text-lg" disabled={buttonDisabled} onClick={handleOpenInfo}>
            {(isCheckingIp || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonText}
          </Button>
          {!hasAlreadySigned && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Info className="h-3 w-3" /> To prevent spam, you can only sign a board once.
            </p>
          )}
        </div>

        {/* The 3-D T-Shirt board — always visible, shows all signatures baked onto the shirt */}
        <div className="mt-4 flex-1 flex flex-col">
          <h1 className="text-3xl font-bold font-headline text-center mb-4 text-primary">The Board</h1>
          <div className="w-full max-w-4xl mx-auto flex-1 min-h-[420px] rounded-lg border shadow-2xl dark:shadow-primary/20 shadow-primary/40 overflow-hidden bg-black">
            {areSignaturesLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin text-primary h-8 w-8" />
              </div>
            ) : (
              <TShirtBoard
                existingSignatures={existingSignatures}
                className="w-full h-full"
              />
            )}
          </div>
        </div>
      </div>

      {/* Name + Note dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Before you sign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Your Name</Label>
              <Input placeholder="Jane Doe" value={sigName} onChange={(e) => setSigName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Your Note</Label>
              <Input placeholder="Wishing you all the best!" value={sigNote} onChange={(e) => setSigNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={handleOpenModal}>Open T-Shirt</Button>
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