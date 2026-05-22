
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
      toast({ variant: 'destructive', title: 'PDF Download Failed', description: 'Something went wrong.' });
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
      className="flex flex-col min-h-[calc(100vh-4rem)] bg-background"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header with Top Bar */}
      <motion.div 
        className="border-b border-border/50 bg-background/80 backdrop-blur-sm p-6 md:p-8"
        variants={itemVariants}
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
              <span className="font-pacifico text-5xl md:text-6xl text-secondary">Your</span>
              {' '}Dashboard
            </h1>
            <p className="text-foreground/60">
              Manage your signature board and share memories with friends.
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  disabled={isDownloading}
                  className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all group"
                >
                  {isDownloading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4 group-hover:animate-bounce" />
                  )}
                  {isDownloading ? 'Exporting...' : 'Export Board'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuItem onClick={handleDownloadImage}>
                  <ImageIcon className="mr-2 h-4 w-4 text-primary" />
                  <span>Export as Image (PNG)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadPdf}>
                  <FileText className="mr-2 h-4 w-4 text-secondary" />
                  <span>Export as PDF</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start max-w-7xl mx-auto">
            {/* Canvas Section - Takes 2 columns */}
            <motion.div 
              className="lg:col-span-2"
              variants={itemVariants}
            >
              <div className="space-y-4 mb-4">
                <h2 className="text-xl font-bold">Your Signature Board</h2>
                <p className="text-sm text-foreground/60">Share your unique canvas with friends</p>
              </div>
              
              <motion.div 
                className="relative group"
                whileHover={{ scale: 1.01 }}
                transition={{ duration: 0.3 }}
              >
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/30 via-secondary/30 to-accent/30 rounded-3xl opacity-20 group-hover:opacity-40 blur-2xl transition-all duration-500"></div>
                <div className="relative w-full aspect-[4/3] rounded-2xl border-2 border-border shadow-2xl overflow-hidden bg-black/50">
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
            </motion.div>

            {/* Right Sidebar - Stacked Cards */}
            <motion.div 
              className="lg:col-span-1"
              variants={itemVariants}
            >
              <div className="sticky top-8 space-y-6">
                {/* Share Card */}
                <motion.div 
                  className="card-box space-y-4"
                  whileHover={{ translateY: -4 }}
                >
                  <h3 className="text-lg font-bold">Share Board</h3>
                  <div className="border-t border-border/30 pt-4">
                    <ShareLink studentId={student.id} />
                  </div>
                </motion.div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>

                {/* Summary Card */}
                <motion.div 
                  className="card-box"
                  whileHover={{ translateY: -4 }}
                >
                  <h3 className="text-lg font-bold mb-4">Board Insights</h3>
                  <SentimentSummary signatures={signatures || []} />
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
