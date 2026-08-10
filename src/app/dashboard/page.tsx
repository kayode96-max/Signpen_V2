'use client';

import SentimentSummary from '@/components/dashboard/sentiment-summary';
import ShareLink from '@/components/dashboard/share-link';
import {
  useUser,
  useCollection,
  useMemoFirebase,
  useFirestore,
  useDoc,
  collection,
  query,
  doc,
  setDocumentNonBlocking
} from '@/supabase';
import { Loader2, Image as ImageIcon, FileText, Download, Sparkles, X, ArrowRight, Pencil, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRef, useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Signature, Student } from '@/lib/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'noto-color-emoji';
import { motion } from "framer-motion";
import dynamic from 'next/dynamic';
import type { TShirtBoardRef } from '@/components/3d/TShirtBoard';
import type { ExistingSignature } from '@/components/3d/TShirtCanvas';

const TShirtBoard = dynamic(() => import('@/components/3d/TShirtBoard'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-transparent">
      <Loader2 className="h-8 w-8 animate-spin text-white" />
    </div>
  ),
});

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const boardRef = useRef<TShirtBoardRef>(null);
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [hoveredSig, setHoveredSig] = useState<{ sig: ExistingSignature, x: number, y: number } | null>(null);
  const [showBanner, setShowBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hide_customization_banner') !== 'true';
    }
    return true;
  });

  const handleDismissBanner = () => {
    localStorage.setItem('hide_customization_banner', 'true');
    setShowBanner(false);
  };

  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleDismissOnboarding = () => {
    if (user) {
      localStorage.setItem(`onboarding_shown_${user.uid}`, 'true');
    }
    setShowOnboarding(false);
  };

  const studentDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'students', user.uid) : null),
    [firestore, user]
  );

  const {
    data: student,
    isLoading: isStudentLoading,
    error: studentError,
  } = useDoc<Student>(studentDocRef);

  useEffect(() => {
    if (user) {
      const key = `onboarding_shown_${user.uid}`;
      if (localStorage.getItem(key) !== 'true') {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  useEffect(() => {
    if (isUserLoading || isStudentLoading) return;
    if (user && !student && studentDocRef) {
      const signupName = typeof window !== 'undefined' ? localStorage.getItem('signup_name') : null;
      const finalName = signupName || user.displayName || user.email?.split('@')[0] || 'Student';

      const defaultStudent: Student = {
        id: user.uid,
        name: finalName,
        email: user.email || '',
        profilePhotoUrl: user.photoURL || '',
        pageSettings: {
          theme: 'light',
          pageHeading: `${finalName}'s Sign-Off`,
          pageSubheading: `Sign My Final Year Board 🎓✨`,
          backgroundImageUrl: '',
        },
        popupMessageConfig: {
          title: 'Thank You So Much ❤️',
          message: 'Your message means the world to me. Thank you for being a part of my journey!',
        },
      };
      setDocumentNonBlocking(studentDocRef, defaultStudent, { merge: false });

      if (typeof window !== 'undefined') {
        localStorage.removeItem('signup_name');
      }
    }
  }, [user, student, isUserLoading, isStudentLoading, studentDocRef]);

  const signaturesQuery = useMemoFirebase(
    () =>
      student
        ? query(collection(firestore, `students/${student.id}/signatures`))
        : null,
    [firestore, student]
  );

  const { data: signatures, isLoading: areSignaturesLoading } =
    useCollection<Signature>(signaturesQuery);

  const handleDownloadImage = () => {
    const dataUrl = boardRef.current?.getScreenshot();
    if (!dataUrl) {
      toast({ variant: 'destructive', title: 'Error', description: 'Board not ready.' });
      return;
    }
    const link = document.createElement('a');
    link.download = 'signpen-board.png';
    link.href = dataUrl;
    link.click();
    toast({ title: 'Image Downloaded!', description: 'Your signature board has been saved.' });
  };

  const handleDownloadPdf = async () => {
    const dataUrl = boardRef.current?.getScreenshot();
    if (!dataUrl || !signatures) {
      toast({ variant: 'destructive', title: 'Error', description: 'Board or signatures not ready.' });
      return;
    }

    setIsDownloading(true);
    toast({ title: 'Generating PDF…', description: 'This might take a moment.' });

    try {
      const pdfDoc = new jsPDF({ orientation: 'p', unit: 'px', format: 'a4' });
      pdfDoc.addFont('NotoColorEmoji.ttf', 'NotoColorEmoji', 'normal');
      pdfDoc.setFont('NotoColorEmoji');

      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const imgProps = pdfDoc.getImageProperties(dataUrl);
      const imgWidth = pageWidth * 0.9;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      const x = (pageWidth - imgWidth) / 2;

      pdfDoc.setFontSize(20);
      pdfDoc.text('Your SignPen Board', x, 30);
      pdfDoc.addImage(dataUrl, 'PNG', x, 40, imgWidth, imgHeight);

      const finalY = 40 + imgHeight + 20;
      pdfDoc.setFontSize(16);
      pdfDoc.text('Messages & Notes', x, finalY);

      autoTable(pdfDoc, {
        startY: finalY + 10,
        head: [['From', 'Note']],
        body: signatures.map((sig) => [sig.signatoryName, sig.signatoryNote]),
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] },
        margin: { left: x, right: x },
        styles: { font: 'NotoColorEmoji' },
      });

      pdfDoc.save('signpen-board.pdf');
      toast({ title: 'PDF Downloaded!', description: 'Your complete signature board has been saved.' });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'PDF Download Failed', description: 'Something went wrong.' });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isUserLoading || (isStudentLoading && !studentError)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black -mx-4 md:-mx-6 -mt-24 pt-24">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black -mx-4 md:-mx-6 -mt-24 pt-24">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen bg-black text-white font-sans flex flex-col selection:bg-white/20 absolute inset-0 pt-16 overflow-hidden">
      
      {/* Header section */}
      <div className="w-full max-w-7xl mx-auto pt-4 px-8 shrink-0 z-10 relative pointer-events-none flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-white text-center md:text-left pointer-events-auto drop-shadow-lg">
          Take a closer look.
        </h1>
        {showBanner && (
          <div className="pointer-events-auto bg-[#1c1c1e]/90 border border-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between gap-4 max-w-md shadow-2xl relative">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-yellow-400" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-white">Customize Your Signing Page!</p>
                <p className="text-xs text-zinc-400">
                  Go to{" "}
                  <Link href="/dashboard/settings#customize" className="text-white underline font-semibold hover:text-gray-300">
                    Settings
                  </Link>{" "}
                  to change your headings, theme, and thank-you message.
                </p>
              </div>
            </div>
            <button 
              onClick={handleDismissBanner} 
              className="text-zinc-500 hover:text-white transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Board section with Spotlight effect */}
      <div className="w-full flex-1 min-h-0 flex justify-center items-center relative z-0">
        
        {/* Spotlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vw] h-[100vw] max-w-[1200px] max-h-[1200px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.12)_0%,_transparent_60%)] pointer-events-none -z-10"></div>

        <div className="w-full h-full relative z-10">
          <TShirtBoard
            ref={boardRef}
            existingSignatures={(signatures || []).map((s): ExistingSignature => ({
              signatureImageUrl: s.signatureImageUrl,
              position: s.position,
              name: s.signatoryName,
              note: s.signatoryNote,
            }))}
            onHoverSignature={(sig: any, x: number, y: number) => {
              if (sig) {
                setHoveredSig({ sig, x, y });
              } else {
                setHoveredSig(null);
              }
            }}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="w-full shrink-0 flex items-center justify-center pb-6 pt-2 z-20 relative pointer-events-auto px-4">
        <div className="flex items-center bg-[#1c1c1e]/90 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-2xl overflow-x-auto no-scrollbar max-w-[90vw]">
          <ShareLink studentId={student.id} />
          <div className="w-[1px] h-6 bg-white/20 mx-1 shrink-0"></div>
          
          <SentimentSummary signatures={signatures || []} />
          
          <div className="w-[1px] h-6 bg-white/20 mx-1 shrink-0"></div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button 
                whileTap={{ scale: 0.95 }}
                disabled={isDownloading}
                className="rounded-full px-4 py-2 hover:bg-white/10 flex items-center gap-2 text-sm text-white transition-colors shrink-0 disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">Download</span>
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" className="bg-[#1c1c1e] text-white border-white/10 mb-2 rounded-xl">
              <DropdownMenuItem onClick={handleDownloadImage} className="cursor-pointer hover:bg-white/10 focus:bg-white/10 focus:text-white rounded-lg">
                <ImageIcon className="h-4 w-4 mr-2" />
                <span>Save as PNG</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadPdf} className="cursor-pointer hover:bg-white/10 focus:bg-white/10 focus:text-white rounded-lg">
                <FileText className="h-4 w-4 mr-2" />
                <span>Save as PDF</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tooltip for Hovered Signature */}
      {hoveredSig && hoveredSig.sig.name && (
        <div 
          className="fixed z-50 pointer-events-none bg-white/95 backdrop-blur-md text-black p-3.5 rounded-xl shadow-2xl max-w-[250px] border border-black/5 transform -translate-x-1/2 -translate-y-[calc(100%+20px)]"
          style={{ left: hoveredSig.x, top: hoveredSig.y }}
        >
          <div className="font-bold text-[15px] leading-tight">{hoveredSig.sig.name}</div>
          {hoveredSig.sig.note && (
            <div className="text-sm text-gray-700 mt-2 leading-snug break-words">
              {hoveredSig.sig.note}
            </div>
          )}
        </div>
      )}

      {/* Onboarding Dialog Modal */}
      <Dialog open={showOnboarding} onOpenChange={(v) => { if (!v) handleDismissOnboarding(); }}>
        <DialogContent className="sm:max-w-lg bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl p-6">
          <DialogHeader className="pb-4 border-b border-white/5">
            <DialogTitle className="text-3xl font-headline tracking-tight text-white flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-yellow-400 animate-pulse" />
              Welcome to SignPen!
            </DialogTitle>
            <DialogDescription className="text-white/60 text-base mt-2">
              Your digital signature board has been created successfully. Here's how to get started:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Pencil className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white/95">1. Customize Your Signing Page</h3>
                <p className="text-sm text-white/60 mt-1">
                  Upload a background photo, toggle dark mode, customize the page headings, and personalize the thank-you card message shown to your friends.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white/95">2. Share Your Link</h3>
                <p className="text-sm text-white/60 mt-1">
                  Copy your unique board link from the dashboard and send it to your classmates, teachers, or friends so they can sign.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white/95">3. Download the Keepsake</h3>
                <p className="text-sm text-white/60 mt-1">
                  Once everyone has signed, download your fully completed 3D signature board as a PNG image or a PDF memory card.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-3">
            <DialogClose asChild>
              <Button 
                variant="ghost" 
                className="text-white hover:bg-white/10 hover:text-white rounded-full w-full sm:w-auto animate-none hover:animate-none"
              >
                Go to Dashboard
              </Button>
            </DialogClose>
            <Link href="/dashboard/settings#customize" onClick={handleDismissOnboarding} className="w-full sm:w-auto">
              <Button className="bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium w-full">
                Customize Page Now
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
