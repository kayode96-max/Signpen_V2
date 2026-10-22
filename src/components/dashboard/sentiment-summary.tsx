"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { Signature } from "@/lib/types";
import { motion } from "framer-motion";
import { supabase } from "@/supabase";

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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Sign in to analyze sentiments.");
        return;
      }
      const response = await fetch("/api/sentiment-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({ error: "Sentiment request failed." }));
      if (!response.ok) {
        throw new Error(result.error || "Sentiment request failed.");
      }
      setSummary(result.sentimentSummary);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to analyze sentiments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex items-center">
      <motion.button 
        whileTap={{ scale: 0.95 }}
        onClick={handleAnalyze} 
        disabled={isLoading || signatures.length === 0} 
        className="rounded-full px-4 py-2 hover:bg-white/10 flex items-center gap-2 text-sm text-white transition-colors disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        <span className="hidden sm:inline">{isLoading ? 'Analyzing...' : (signatures.length > 0 ? 'AI Sentiments' : 'No Signatures')}</span>
      </motion.button>

      {summary && !isLoading && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-full mb-4 right-0 w-64 sm:w-80 md:w-96 text-left text-sm text-white/90 p-4 bg-[#1c1c1e]/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl z-50"
        >
          {summary}
        </motion.div>
      )}
      {error && !isLoading && (
        <div className="absolute bottom-full mb-4 right-0 text-red-400 text-sm bg-[#1c1c1e] p-3 rounded-xl border border-red-500/30 whitespace-nowrap z-50">{error}</div>
      )}
    </div>
  );
}
