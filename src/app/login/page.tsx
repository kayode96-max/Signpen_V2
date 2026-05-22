
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
    <div className="flex items-center justify-center min-h-screen bg-background p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      <motion.div 
        className="w-full max-w-md relative z-10"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {/* Logo */}
        <motion.div 
          className="text-center mb-8"
          variants={itemVariants}
        >
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow duration-300">
              <Image
                src="/images/signpen.png"
                alt="SignPen Logo"
                width={28}
                height={28}
                className="object-contain filter invert"
              />
            </div>
            <span className="text-xl font-bold font-headline group-hover:text-primary transition-colors">SignPen</span>
          </Link>
        </motion.div>

        {/* Main Auth Card */}
        <motion.div
          variants={itemVariants}
        >
          <Card className="w-full border border-border/50 backdrop-blur-sm bg-card/95 shadow-2xl rounded-2xl overflow-hidden">
            {/* Card glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 opacity-0 hover:opacity-100 transition-opacity duration-500"></div>
            
            <CardHeader className="text-center pb-4 relative z-10">
              <motion.div variants={itemVariants} className="space-y-2">
                <CardTitle className="text-4xl font-bold font-pacifico text-secondary">Welcome</CardTitle>
                <CardDescription className="text-base">
                  Sign in or create an account to start collecting memories
                </CardDescription>
              </motion.div>
            </CardHeader>

            <CardContent className="relative z-10">
              <motion.div variants={itemVariants}>
                <AuthForm />
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Back to home link */}
        <motion.div 
          className="text-center mt-6"
          variants={itemVariants}
        >
          <Link href="/" className="text-sm text-foreground/60 hover:text-foreground transition-colors duration-300 group">
            ← <span className="group-hover:underline">Back to Home</span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
