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
      <DialogContent className="sm:max-w-[425px] text-center">
        {open && <Confetti />}
        <DialogHeader>
          <DialogTitle className="text-2xl font-headline mx-auto">
            {student.popupMessageConfig.title}
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            {student.popupMessageConfig.message}
          </DialogDescription>
        </DialogHeader>
        <div className="text-center text-sm text-muted-foreground">
            <p>Your signature has been sent to {student.name}!</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
