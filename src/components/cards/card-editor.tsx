"use client";

import { useState, useRef } from "react";
import type { Signature, Student } from "@/lib/types";
import ThankYouCard from "./thank-you-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Image as ImageIcon, Palette, Share2, Sticker } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toPng } from 'html-to-image';


const themes = [
  { name: "Minimal", bg: "bg-white", text: "text-gray-800", border: "border-gray-200" },
  { name: "Dark", bg: "bg-gray-800", text: "text-white", border: "border-gray-600" },
  { name: "Gold", bg: "bg-yellow-50", text: "text-yellow-900", border: "border-yellow-300" },
  { name: "Pastel", bg: "bg-pink-50", text: "text-pink-800", border: "border-pink-200" },
  { name: "Neon", bg: "bg-black", text: "text-cyan-300", border: "border-fuchsia-500" },
];

export default function CardEditor({ signature, student }: { signature: Signature, student: Student }) {
  const [editedMessage, setEditedMessage] = useState(`Thank you for the wonderful message, ${signature.signatoryName}! I'll always cherish it.`);
  const [selectedTheme, setSelectedTheme] = useState(themes[0]);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleExport = () => {
    if (cardRef.current === null) {
      return;
    }
    toast({ title: 'Generating image...', description: 'Your card is being prepared for download.' });
    toPng(cardRef.current, { cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `thank-you-${signature.signatoryName}.png`;
        link.href = dataUrl;
        link.click();
        toast({ title: 'Download started!', description: 'Your thank you card is being downloaded.' });
      })
      .catch((err) => {
        console.error(err);
        toast({ variant: 'destructive', title: 'Oh no!', description: 'Could not generate the image.' });
      });
  };

  return (
    <div className="grid md:grid-cols-[1fr_300px] gap-8">
      <div className="flex items-center justify-center bg-muted/50 p-8 rounded-lg">
        <div ref={cardRef}>
          <ThankYouCard
            signature={signature}
            student={student}
            customMessage={editedMessage}
            theme={selectedTheme}
          />
        </div>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Palette /> Themes</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {themes.map(theme => (
              <Button key={theme.name} variant={selectedTheme.name === theme.name ? 'secondary' : 'ghost'} onClick={() => setSelectedTheme(theme)}>
                {theme.name}
              </Button>
            ))}
          </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Sticker /> Add-ons</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled><ImageIcon className="mr-2 h-4 w-4" />Background</Button>
                <Button variant="outline" disabled><Sticker className="mr-2 h-4 w-4" />Stickers</Button>
            </CardContent>
        </Card>
        <div className="space-y-2">
            <Button onClick={handleExport} className="w-full"><Download className="mr-2 h-4 w-4"/>Export as PNG</Button>
            <Button variant="outline" className="w-full" disabled><Share2 className="mr-2 h-4 w-4"/>Share</Button>
        </div>
      </div>
    </div>
  );
}
