import type { Signature } from "@/lib/types";
import React from "react";
import ClientSignatureGallery from "./client-signature-gallery";

interface SignatureGalleryProps {
  signatures: Signature[];
  isPublic: boolean;
}

const SignatureGallery = React.forwardRef<HTMLDivElement, SignatureGalleryProps>(
  ({ signatures, isPublic }, ref) => {
    return (
      <div ref={ref} className="w-full aspect-[4/3] bg-white rounded-lg border shadow-inner">
        <ClientSignatureGallery signatures={signatures} isPublic={isPublic} />
      </div>
    );
  }
);

SignatureGallery.displayName = "SignatureGallery";

export default SignatureGallery;
