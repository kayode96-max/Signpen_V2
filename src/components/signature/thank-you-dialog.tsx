"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Confetti from "../common/confetti";
import type { Student } from "@/lib/types";

interface ThankYouDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student;
}

export default function ThankYouDialog({ open, onOpenChange, student }: ThankYouDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] text-center bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl overflow-hidden p-8">
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
      </DialogContent>
    </Dialog>
  );
}
