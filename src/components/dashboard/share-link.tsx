
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function ShareLink({ studentId }: { studentId: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // This ensures window is available
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

  if (!shareUrl) {
    return null;
  }

  return (
    <Card className="bg-card/70 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Share Your Page</CardTitle>
        <CardDescription>
          Share this link with friends to get signatures.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={shareUrl} readOnly className="flex-1 bg-muted/50 border-border" />
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button onClick={handleCopy} variant="outline" size="icon" className="w-full sm:w-10">
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              <span className="sr-only">Copy</span>
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button onClick={handleShare} size="icon" className="w-full sm:w-10">
              <Share2 className="h-4 w-4" />
              <span className="sr-only">Share</span>
            </Button>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  );
}
