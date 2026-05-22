
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/firebase";
import AuthForm from "@/components/auth/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    },
  },
};

export default function LoginPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push("/dashboard");
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-10 w-10 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <motion.header 
        className="border-b border-border/50 bg-background/80 backdrop-blur-xl"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
              S
            </div>
            <span className="text-lg font-bold font-headline">SignPen</span>
          </Link>
          <Link href="/" className="text-sm text-foreground/60 hover:text-foreground transition-colors">
            Back Home
          </Link>
        </div>
      </motion.header>

      {/* Main Content - 2 Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Branding & Value Props */}
        <motion.div 
          className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 via-secondary/5 to-background border-r border-border/50 relative overflow-hidden"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {/* Background decoration */}
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-secondary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-float" style={{ animationDelay: '2s' }}></div>

          <div className="relative z-10 flex flex-col justify-center items-start p-12 space-y-12 max-w-md">
            <motion.div className="space-y-6" variants={containerVariants}>
              <motion.h1 
                className="text-5xl font-bold tracking-tight"
                variants={itemVariants}
              >
                <span className="font-sacramento text-6xl text-primary block mb-2">Your</span>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Stories</span>
              </motion.h1>
              <motion.p 
                className="text-lg text-foreground/70 leading-relaxed"
                variants={itemVariants}
              >
                Create your personalized signature board and collect beautiful memories from friends and classmates.
              </motion.p>
            </motion.div>

            {/* Features List */}
            <motion.ul className="space-y-4" variants={containerVariants}>
              {[
                { icon: '✨', text: 'Interactive Canvas' },
                { icon: '🎨', text: 'Creative Tools' },
                { icon: '💾', text: 'Export & Keep' },
              ].map((item, idx) => (
                <motion.li 
                  key={idx}
                  className="flex items-center gap-3"
                  variants={itemVariants}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-foreground/80">{item.text}</span>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </motion.div>

        {/* Right Side - Auth Form */}
        <motion.div 
          className="flex-1 lg:flex-none lg:w-96 flex flex-col justify-center items-center p-6 md:p-8"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <motion.div 
            className="w-full max-w-sm space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Header */}
            <motion.div className="text-center space-y-2" variants={itemVariants}>
              <h2 className="text-4xl font-bold font-pacifico text-secondary">Welcome</h2>
              <p className="text-foreground/60">
                Sign in or create an account
              </p>
            </motion.div>

            {/* Auth Card */}
            <motion.div
              variants={itemVariants}
              className="card-box"
            >
              <div className="space-y-6">
                <AuthForm />
              </div>
            </motion.div>

            {/* Footer Text */}
            <motion.p 
              className="text-xs text-foreground/50 text-center"
              variants={itemVariants}
            >
              By signing up, you agree to create a SignPen account and start collecting memories.
            </motion.p>
          </motion.div>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.footer 
        className="border-t border-border/50 bg-card/50 backdrop-blur-xl"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <div className="container mx-auto px-4 md:px-6 py-6 text-center">
          <p className="text-xs text-foreground/50">
            &copy; {new Date().getFullYear()} SignPen. All rights reserved.
          </p>
        </div>
      </motion.footer>
    </div>
  );
}
