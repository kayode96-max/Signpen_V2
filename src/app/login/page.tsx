
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
      <div className="flex items-center justify-center min-h-screen bg-secondary">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="dark flex items-center justify-center min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black p-4">
       <motion.div 
        className="w-full max-w-5xl grid md:grid-cols-2 gap-12 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="hidden md:flex flex-col space-y-6 text-left">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
             <Image
                src="/images/signpen.png"
                alt="SignPen Logo"
                width={140}
                height={70}
                className="object-contain filter invert opacity-90"
              />
          </Link>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-white font-headline leading-tight">
            Preserve Your <br/><span className="text-zinc-500">Best Memories.</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-md">
            Join thousands of students capturing their final year moments with unique, interactive 3D digital signatures. Sign in to start your journey.
          </p>
        </div>

        <Card className="w-full max-w-md mx-auto bg-zinc-900/40 border-zinc-800/50 backdrop-blur-md shadow-2xl text-white">
          <CardHeader className="text-center pb-6">
            <div className="md:hidden flex justify-center mb-6">
              <Link href="/" className="inline-flex items-center gap-2">
                 <Image
                    src="/images/signpen.png"
                    alt="SignPen Logo"
                    width={100}
                    height={50}
                    className="object-contain filter invert opacity-90"
                  />
              </Link>
            </div>
            <CardTitle className="text-2xl font-headline">Welcome Back</CardTitle>
            <CardDescription className="text-zinc-400 mt-2">Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuthForm />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
