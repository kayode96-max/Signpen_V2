
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import type { Signature } from "@/lib/types";

export default function SentimentSummary({ signatures }: { signatures: Signature[] }) {
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError("");
    setSummary("");
    try {
      if (signatures.length === 0) {
        setSummary("No signatures yet to analyze. Share your page to get started!");
        return;
      }
      const messages = signatures.map(s => `${s.signatoryName}: "${s.signatoryNote}"`);
      const response = await fetch("/api/sentiment-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signatures: messages }),
      });
      if (!response.ok) {
        throw new Error("Sentiment request failed.");
      }
      const result: { sentimentSummary: string } = await response.json();
      setSummary(result.sentimentSummary);
    } catch (e) {
      console.error(e);
      setError("Failed to analyze sentiments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-card/70 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-headline text-xl flex items-center gap-2">
          <Sparkles className="text-accent" />
          AI Sentiment Summary
        </CardTitle>
        <CardDescription>
          Get an AI-powered summary of the notes from your friends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && !isLoading && (
          <div className="p-4 bg-muted/50 rounded-lg border text-sm text-muted-foreground">
            {summary}
          </div>
        )}
        {error && !isLoading && (
          <div className="p-4 bg-destructive/10 text-destructive-foreground rounded-lg border border-destructive/20 text-sm">
            {error}
          </div>
        )}
        <Button 
          onClick={handleAnalyze} 
          disabled={isLoading || signatures.length === 0} 
          className="w-full transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-[1.02]"
          variant="secondary"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {signatures.length > 0 ? 'Analyze Sentiments' : 'No Signatures Yet'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
