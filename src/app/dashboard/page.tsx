
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
import { Loader2, Download, Image as ImageIcon, FileText } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Signature } from '@/lib/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'noto-color-emoji';
import { motion } from "framer-motion";
import dynamic from 'next/dynamic';
import type { TShirtBoardRef } from '@/components/3d/TShirtBoard';
import type { ExistingSignature } from '@/components/3d/TShirtCanvas';
import { getErrorDisplay } from '@/lib/error-display';

const TShirtBoard = dynamic(() => import('@/components/3d/TShirtBoard'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-black rounded-lg">
      <Loader2 className="h-8 w-8 animate-spin text-white" />
    </div>
  ),
});

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
    },
  },
};


export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const boardRef = useRef<TShirtBoardRef>(null);
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

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
      const display = getErrorDisplay(err, {
        title: 'PDF download failed',
        description: "We couldn't generate your PDF right now.",
      });
      toast({ variant: 'destructive', title: display.title, description: display.description });
    } finally {
      setIsDownloading(false);
    }
  };


  if (isUserLoading || (isStudentLoading && !studentError)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    if (user) {
      return <CreateProfile user={user} />;
    }
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div 
      className="p-4 sm:p-6 lg:p-8 space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div 
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        variants={itemVariants}
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening on your SignPen page.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={isDownloading}>
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isDownloading ? 'Downloading...' : 'Download Board'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleDownloadImage}>
              <ImageIcon className="mr-2 h-4 w-4" />
              <span>Download as Image (PNG)</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadPdf}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Download as Document (PDF)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <motion.div className="lg:col-span-2 space-y-8" variants={itemVariants}>
          <div className="w-full aspect-[4/3] rounded-lg border shadow-inner overflow-hidden bg-black">
            <TShirtBoard
              ref={boardRef}
              existingSignatures={(signatures || []).map((s): ExistingSignature => ({
                signatureImageUrl: s.signatureImageUrl,
                position: s.position,
              }))}
              className="w-full h-full"
            />
          </div>
        </motion.div>

        <motion.div className="lg:col-span-1 space-y-8" variants={itemVariants}>
          <ShareLink studentId={student.id} />
          <SentimentSummary signatures={signatures || []} />
        </motion.div>
      </div>
    </motion.div>
  );
}
