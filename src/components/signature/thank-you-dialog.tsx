"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Confetti from "../common/confetti";
import type { Student } from "@/lib/types";
import { downloadDataUrl, whatsAppBoardShareHref } from "@/lib/signing/signer-ui";

interface ThankYouDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student;
  /** Shirt screenshot captured at submit. Omitted when the canvas had nothing to save. */
  pictureUrl?: string;
}

export default function ThankYouDialog({ open, onOpenChange, student, pictureUrl }: ThankYouDialogProps) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareHref = origin
    ? whatsAppBoardShareHref({
        studentName: student.name,
        studentId: student.id,
        origin,
      })
    : "https://wa.me/?text=";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[425px] text-center bg-[#121212] border border-white/10 text-white rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl overflow-hidden p-6 sm:p-8">
        {open && <Confetti />}
        <DialogHeader>
          <DialogTitle className="text-3xl font-headline mx-auto tracking-tight">
            {student.popupMessageConfig.title}
          </DialogTitle>
          <DialogDescription className="text-center pt-2 text-white/60 text-base">
            {student.popupMessageConfig.message}
          </DialogDescription>
        </DialogHeader>
        <div className="text-center text-sm text-white/40 mt-4">
            <p>Your signature has been sent to {student.name}!</p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
          >
            Share on WhatsApp
          </a>
          <Link
            href="/signup"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/20 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
          >
            Make your own
          </Link>
          {pictureUrl ? (
            <button
              type="button"
              onClick={() => downloadDataUrl(pictureUrl, `signpen-${student.id}.png`)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/20 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
            >
              Save picture
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
