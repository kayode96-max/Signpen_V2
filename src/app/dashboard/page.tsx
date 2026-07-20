'use client';

import CreateProfile from '@/components/dashboard/create-profile';
import SentimentSummary from '@/components/dashboard/sentiment-summary';
import ShareLink from '@/components/dashboard/share-link';
import {
  useUser,
  useCollection,
  useMemoFirebase,
  useFirestore,
  useDoc,
} from '@/firebase';
import { collection, query, doc } from 'firebase/firestore';
import { Loader2, Image as ImageIcon, FileText } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Signature } from '@/lib/types';
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

  const studentDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'students', user.uid) : null),
    [firestore, user]
  );

  const {
    data: student,
    isLoading: isStudentLoading,
    error: studentError,
  } = useDoc(studentDocRef);

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
    if (user) {
      return (
        <div className="min-h-screen bg-black -mx-4 md:-mx-6 -mt-24 pt-24 pb-12 flex justify-center items-center">
          <div className="w-full max-w-md bg-white rounded-lg p-6">
            <CreateProfile user={user} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-black -mx-4 md:-mx-6 -mt-24 pt-24">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black text-white font-sans flex flex-col selection:bg-white/20 absolute inset-0 pt-16 overflow-hidden">
      
      {/* Header section */}
      <div className="w-full max-w-7xl mx-auto pt-4 px-8 pb-4 shrink-0 z-10 relative pointer-events-none">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-white text-center md:text-left pointer-events-auto drop-shadow-lg">
          Take a closer look.
        </h1>
      </div>

      {/* Board section with Spotlight effect */}
      <div className="w-full flex-1 flex justify-center items-center relative z-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.15)_0%,_transparent_50%)]">
        <div className="h-full aspect-square max-w-full">
          <TShirtBoard
            ref={boardRef}
            existingSignatures={(signatures || []).map((s): ExistingSignature => ({
              signatureImageUrl: s.signatureImageUrl,
              position: s.position,
              name: s.signatoryName,
              note: s.signatoryNote,
            }))}
            onHoverSignature={(sig, x, y) => {
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

      {/* Buttons section */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-4 z-20 pointer-events-auto">
        
        <SentimentSummary signatures={signatures || []} />

        <div className="flex flex-wrap justify-end items-center gap-4">
          <ShareLink studentId={student.id} />
          
          <div className="flex items-center gap-2 bg-[#1c1c1e] p-1 rounded-full border border-white/10">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={handleDownloadImage}
              disabled={isDownloading}
              className="rounded-full px-4 py-2 hover:bg-white/10 flex items-center gap-2 text-sm text-white transition-colors"
            >
              <ImageIcon className="h-4 w-4" />
              <span>PNG</span>
            </motion.button>
            <div className="w-[1px] h-4 bg-white/20"></div>
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="rounded-full px-4 py-2 hover:bg-white/10 flex items-center gap-2 text-sm text-white transition-colors"
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span>PDF</span>
            </motion.button>
          </div>
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

    </div>
  );
}
