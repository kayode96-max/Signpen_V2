'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Star, 
  MessageSquare, 
  Mail, 
  Clock, 
  Sparkles, 
  User, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import NavBar from "@/components/LandingPage/NavBar";
import { useToast } from "@/hooks/use-toast";
import { useCollection, collection, supabase } from "@/supabase";
import { Button } from "@/components/ui/button";

interface FeedbackItem {
  id: string;
  name: string;
  email: string;
  message: string;
  rating?: number;
  type: 'comment' | 'review' | 'inquiry';
  created_at: string;
}

const formVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" } 
  }
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.4, ease: "easeOut" } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    transition: { duration: 0.2 } 
  }
};

const avatarColors = [
  'bg-red-500/20 text-red-400 border-red-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-teal-500/20 text-teal-400 border-teal-500/30',
];

export default function ContactPage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // Form State
  const [type, setType] = useState<'comment' | 'review' | 'inquiry'>('review');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(5);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Real-time Database feed
  // Public wall reads a view without the email column; feedback.email is not readable.
  const feedbackCollectionRef = useMemo(() => collection(null, 'feedback_public'), []);
  const { data: feedbackData, isLoading, error } = useCollection<FeedbackItem>(feedbackCollectionRef);

  // Sorting feedback to show latest first
  const sortedFeedback = useMemo(() => {
    if (!feedbackData) return [];
    return [...feedbackData].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [feedbackData]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({
        variant: "destructive",
        title: "Incomplete Form",
        description: "Please fill in all fields before submitting."
      });
      return;
    }

    startTransition(async () => {
      try {
        // Insert without reading the row back (email is write-only for the public).
        const { error: insertError } = await supabase.from('feedback').insert({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          type,
          rating: type === 'review' ? rating : null,
          created_at: new Date().toISOString()
        });
        if (insertError) throw insertError;
        window.dispatchEvent(new CustomEvent('supabase-write', { detail: { table: 'feedback_public' } }));

        setIsSuccess(true);
        toast({
          title: "Feedback Submitted!",
          description: "Thank you! Your feedback has been posted in real-time."
        });

        // Reset form
        setTimeout(() => {
          setName('');
          setEmail('');
          setMessage('');
          setRating(5);
          setIsSuccess(false);
        }, 3000);
      } catch (err: any) {
        console.error("Submission failed:", err);
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: err.message || "Something went wrong. Please check your Supabase schema settings."
        });
      }
    });
  };

  // Draft Email Action
  const handleEmailRedirect = () => {
    const emailSubject = encodeURIComponent(`SignPen Contact: ${type.toUpperCase()} from ${name || 'User'}`);
    const emailBody = encodeURIComponent(
      `Hello SignPen Support Team,\n\nName: ${name || 'N/A'}\nEmail: ${email || 'N/A'}\nType: ${type}\n${
        type === 'review' ? `Rating: ${rating} Stars\n` : ''
      }\nMessage:\n${message || '[No message typed yet]'}\n\nSent from SignPen Contact Page.`
    );
    window.open(`mailto:support@signpen.com?subject=${emailSubject}&body=${emailBody}`, '_blank');
  };

  // Helper to color type tags
  const getTypeBadgeStyles = (t: 'comment' | 'review' | 'inquiry') => {
    switch (t) {
      case 'review': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'comment': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'inquiry': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
    }
  };

  // Helper to choose initials avatar colors
  const getAvatarColor = (name: string) => {
    const charCode = name.charCodeAt(0) || 0;
    return avatarColors[charCode % avatarColors.length];
  };

  return (
    <div className="dark flex flex-col min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <NavBar />
      
      {/* Spacer to push content below the fixed header */}
      <div className="h-[10vh] min-h-[80px]" />

      <main className="flex-grow container mx-auto px-4 py-12 md:py-16">
        {/* Title Section */}
        <div className="flex flex-col items-center justify-center text-center space-y-4 mb-16">
          <motion.div 
            className="inline-block rounded-full bg-primary/10 text-primary px-4 py-1 text-sm font-semibold border border-primary/20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            Connect With Us
          </motion.div>
          <motion.h1 
            className="text-4xl md:text-6xl font-bold font-headline tracking-tight text-white max-w-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Drop a Review, Comment, or Message
          </motion.h1>
          <motion.p 
            className="max-w-xl text-zinc-400 text-base md:text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Share your experience with SignPen. Post directly to our live community wall, or draft an email directly to our support team.
          </motion.p>
        </div>

        {/* 2-Column Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Form Section */}
          <motion.div 
            className="lg:col-span-7 bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md shadow-2xl p-6 md:p-8 rounded-2xl relative overflow-hidden"
            variants={formVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-80" />

            {isSuccess ? (
              <motion.div 
                className="flex flex-col items-center justify-center text-center py-20 space-y-4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <div className="w-16 h-16 rounded-full bg-green-500/10 text-green-400 border border-green-500/30 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold font-headline text-white">Thank You!</h3>
                <p className="text-zinc-400 max-w-sm">
                  Your feedback has been submitted successfully and posted to the feedback wall in real-time.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Form Types Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white/70">Feedback Type</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['review', 'comment', 'inquiry'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`py-3 rounded-xl border text-sm font-medium transition-all duration-300 ${
                          type === t
                            ? 'bg-white text-black border-white shadow-lg'
                            : 'bg-[#1c1c1e] text-white/70 border-white/10 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating Stars Section */}
                <AnimatePresence mode="wait">
                  {type === 'review' && (
                    <motion.div 
                      className="space-y-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <label className="text-sm font-semibold text-white/70">Overall Rating</label>
                      <div className="flex items-center gap-2 pt-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const isFilled = hoveredStar !== null ? star <= hoveredStar : star <= rating;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              onMouseEnter={() => setHoveredStar(star)}
                              onMouseLeave={() => setHoveredStar(null)}
                              className="text-yellow-400 focus:outline-none transition-transform duration-200 hover:scale-125"
                            >
                              <Star 
                                className="h-8 w-8 transition-colors duration-200" 
                                fill={isFilled ? 'currentColor' : 'transparent'} 
                                stroke="currentColor"
                                strokeWidth={2}
                              />
                            </button>
                          );
                        })}
                        <span className="text-zinc-400 text-sm ml-2 font-medium">
                          ({rating} out of 5 stars)
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Input Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-semibold text-white/70">Your Name</label>
                    <input
                      id="name"
                      type="text"
                      placeholder="e.g. John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-semibold text-white/70">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="e.g. john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-semibold text-white/70">Your Message</label>
                  <textarea
                    id="message"
                    rows={5}
                    placeholder={`Type your ${type} here...`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-[#1c1c1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                    required
                  />
                </div>

                {/* Submission Options */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={isPending}
                    className="flex-1 bg-white text-black hover:bg-zinc-200 transition-colors py-3 font-semibold rounded-xl text-sm shadow-md"
                  >
                    {isPending ? 'Posting...' : 'Post to Live Wall'}
                    {!isPending && <Send className="h-4 w-4 ml-1" />}
                  </Button>

                  <Button 
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleEmailRedirect}
                    className="flex-1 bg-transparent hover:bg-white/5 border border-white/10 text-white transition-colors py-3 font-semibold rounded-xl text-sm"
                  >
                    Send via Email Client
                    <Mail className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            )}
          </motion.div>

          {/* Right Column: Support & Real-time Feedback Feed */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Email Channels Card */}
            <motion.div 
              className="bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md p-6 rounded-2xl shadow-xl"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-xl font-bold font-headline mb-4 flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" /> Direct Support Channels
              </h2>
              <p className="text-zinc-400 text-sm mb-4 leading-relaxed">
                Click a direct link below to open a pre-filled template in your favorite email client:
              </p>
              
              <div className="space-y-3">
                <a 
                  href="mailto:support@signpen.xyz?subject=SignPen%20General%20Support%20Inquiry" 
                  className="flex items-center justify-between p-3 rounded-xl bg-[#1c1c1e] hover:bg-white/5 border border-white/5 hover:border-white/15 transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">General Support</p>
                      <p className="text-xs text-zinc-500">support@signpen.xyz</p>
                    </div>
                  </div>
                  <Mail className="h-4 w-4 text-zinc-500" />
                </a>

                <a 
                  href="mailto:feedback@signpen.xyz?subject=SignPen%20Product%20Feedback%20Proposal" 
                  className="flex items-center justify-between p-3 rounded-xl bg-[#1c1c1e] hover:bg-white/5 border border-white/5 hover:border-white/15 transition-all duration-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
                      <Star className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">Product Feedback</p>
                      <p className="text-xs text-zinc-500">feedback@signpen.xyz</p>
                    </div>
                  </div>
                  <Mail className="h-4 w-4 text-zinc-500" />
                </a>
              </div>
            </motion.div>

            {/* Live Feed Wall */}
            <div className="bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md p-6 rounded-2xl shadow-xl flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                <h2 className="text-xl font-bold font-headline flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-yellow-400" /> Live Feed
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Real-time
                </div>
              </div>

              {/* Scrollable list */}
              <div className="flex-grow overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                {isLoading ? (
                  // Loading Skeleton
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-3 bg-[#1c1c1e]/50 border border-white/5 rounded-xl animate-pulse space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-zinc-800" />
                          <div className="h-4 bg-zinc-800 rounded w-24" />
                          <div className="h-3 bg-zinc-800 rounded w-12 ml-auto" />
                        </div>
                        <div className="h-3 bg-zinc-800 rounded w-full" />
                        <div className="h-3 bg-zinc-800 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4 space-y-2">
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                    <p className="text-xs text-zinc-400">
                      Failed to fetch live feed. RLS policies or tables may not be created in Supabase yet.
                    </p>
                  </div>
                ) : sortedFeedback.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <MessageSquare className="h-8 w-8 text-zinc-600 mb-2" />
                    <p className="text-sm font-semibold text-zinc-400">No feedback yet</p>
                    <p className="text-xs text-zinc-500">Be the first to submit a review!</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {sortedFeedback.map((item) => (
                      <motion.div
                        key={item.id}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="p-3 bg-[#1c1c1e] hover:bg-zinc-800/40 border border-white/5 rounded-xl transition-all duration-200 text-left"
                      >
                        {/* Header details */}
                        <div className="flex items-center gap-2.5 mb-2">
                          {/* initials avatar */}
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${getAvatarColor(item.name)}`}>
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white truncate max-w-[120px]">{item.name}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full inline-block mt-0.5 ${getTypeBadgeStyles(item.type)}`}>
                              {item.type}
                            </span>
                          </div>

                          <div className="ml-auto text-right">
                            {/* Stars rating rendering */}
                            {item.type === 'review' && item.rating && (
                              <div className="flex items-center gap-0.5 text-yellow-400 mb-0.5">
                                {Array.from({ length: 5 }).map((_, idx) => (
                                  <Star 
                                    key={idx} 
                                    className="h-3 w-3" 
                                    fill={idx < item.rating! ? 'currentColor' : 'transparent'} 
                                  />
                                ))}
                              </div>
                            )}
                            {/* Timeago or simple clock representation */}
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                              <Clock className="h-2.5 w-2.5" />
                              {new Date(item.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Comment text */}
                        <p className="text-xs text-zinc-300 leading-relaxed break-words whitespace-pre-wrap">
                          {item.message}
                        </p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Footer consistent with rest of application */}
      <footer className="flex items-center justify-center w-full h-20 bg-black mt-16 border-t border-white/5">
        <p className="text-sm text-zinc-500">
          &copy; {new Date().getFullYear()} SignPen. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
