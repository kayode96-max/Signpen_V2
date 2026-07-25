
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, MousePointerClick, Pencil, CheckCircle, AlertTriangle } from "lucide-react";

interface InstructionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const steps = [
    {
      icon: <MousePointerClick className="h-6 w-6 text-primary" />,
      title: "Step 1: Start Signing",
      description: "Click the 'Leave Your Signature' button to open the signing window."
    },
    {
      icon: <Pencil className="h-6 w-6 text-primary" />,
      title: "Step 2: Get Creative",
      description: "Fill in your name and a note. Then, use the 'Draw' or 'Text' tool to create your unique message on the canvas."
    },
    {
      icon: <ArrowRight className="h-6 w-6 text-primary" />,
      title: "Step 3: Prepare to Place",
      description: "Once you're happy with your creation, click the 'Create & Place' button."
    },
    {
      icon: <CheckCircle className="h-6 w-6 text-primary" />,
      title: "Step 4: Find the Perfect Spot",
      description: "Your signature will appear over the board. Click anywhere on the board to place it permanently."
    },
    {
      icon: <AlertTriangle className="h-6 w-6 text-amber-500" />,
      title: "Important: Sign Only Once",
      description: "To keep things fair and prevent spam, each person can only sign a student's board one time."
    }
];

export default function InstructionDialog({ open, onOpenChange }: InstructionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#121212] border border-white/10 text-white rounded-[2rem] shadow-2xl">
        <DialogHeader className="pb-2 border-b border-white/5">
          <DialogTitle className="text-2xl font-headline tracking-tight text-white">How to Sign the Board</DialogTitle>
          <DialogDescription className="text-white/60">
            Follow these simple steps to leave your mark!
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            {steps.map((step, index) => (
                <div key={index} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                        {step.icon}
                    </div>
                    <div>
                        <h3 className="font-semibold text-white/90">{step.title}</h3>
                        <p className="text-sm text-white/60 mt-1">{step.description}</p>
                    </div>
                </div>
            ))}
        </div>
        <DialogFooter className="pt-2 border-t border-white/5">
            <Button onClick={() => onOpenChange(false)} className="bg-white text-black hover:bg-gray-200 rounded-full px-6 transition-all font-medium">Got it!</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
