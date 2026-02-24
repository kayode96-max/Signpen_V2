
import type { Signature, Student } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GraduationCap } from "lucide-react";
import Image from "next/image";

interface ThankYouCardProps {
  signature: Signature;
  student: Student;
  customMessage: string;
  theme: {
    bg: string;
    text: string;
    border: string;
  };
}

export default function ThankYouCard({ signature, student, customMessage, theme }: ThankYouCardProps) {
  return (
    <div
      className={cn(
        "w-[350px] aspect-[4/5] rounded-xl shadow-lg p-6 flex flex-col border overflow-hidden",
        theme.bg, theme.text, theme.border
      )}
    >
      <div className="text-center">
        <p className="text-sm">A special thanks to</p>
        <h2 className="text-3xl font-bold font-headline mt-1">{signature.signatoryName}</h2>
      </div>

      <div className="my-4 flex-1 flex items-center justify-center bg-white/50 rounded-lg p-2">
         <Image
            src={signature.signatureImageUrl}
            alt={`Signature from ${signature.signatoryName}`}
            width={300}
            height={150}
            className="object-contain mix-blend-darken"
          />
      </div>

      <div className="text-center space-y-2 mb-4">
        <p className="text-lg italic leading-tight">"{signature.signatoryNote}"</p>
        <p className="text-sm opacity-80">{customMessage}</p>
      </div>

      <div className="mt-auto text-center flex items-center justify-center text-xs opacity-70 gap-2">
        <Image src="/ui/signpen.png" alt="SignPen Logo" width={20} height={20} />
        <span>From {student.name}'s SignPen Board</span>
      </div>
    </div>
  );
}
