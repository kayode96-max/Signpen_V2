"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function ShareLink({ studentId }: { studentId: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setShareUrl(`${window.location.origin}/${studentId}`);
  }, [studentId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "Link copied to clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleShare = () => {
    if(navigator.share) {
      navigator.share({
        title: 'Sign my Final Year Board!',
        text: `I'm graduating! Please sign my digital yearbook on SignPen.`,
        url: shareUrl
      }).catch(console.error);
    } else {
      handleCopy();
    }
  }

  if (!shareUrl) return null;

  return (
    <div className="flex items-center gap-2 bg-[#1c1c1e] p-1 rounded-full border border-white/10">
      <motion.button 
        whileTap={{ scale: 0.95 }}
        onClick={handleCopy} 
        className="rounded-full px-4 py-2 hover:bg-white/10 flex items-center gap-2 text-sm text-white transition-colors"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span>Copy Link</span>
      </motion.button>
      <div className="w-[1px] h-4 bg-white/20"></div>
      <motion.button 
        whileTap={{ scale: 0.95 }}
        onClick={handleShare} 
        className="rounded-full px-4 py-2 hover:bg-white/10 flex items-center gap-2 text-sm text-white transition-colors"
      >
        <Share2 className="h-4 w-4" />
        <span>Share</span>
      </motion.button>
    </div>
  );
}
