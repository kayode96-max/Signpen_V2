'use client';

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import NavBar from "@/components/LandingPage/NavBar";
import Hero from "@/components/LandingPage/Hero";
import Features from "@/components/LandingPage/Features";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
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
      ease: "easeOut",
    },
  },
};

export default function Home() {
  return (
    <div className="dark flex flex-col min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <NavBar />
      <main className="flex-1">
        <Hero />
        <Features />

        <section className="w-full py-20 md:py-28 lg:py-32 bg-transparent">
          <motion.div 
            className="container mx-auto grid items-center justify-center gap-4 px-4 text-center md:px-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            variants={itemVariants}
          >
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight font-headline text-white">
                Ready to Start Collecting Memories?
              </h2>
              <p className="mx-auto max-w-[600px] text-zinc-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Your unique sign-out page is just a click away. Preserve your
                final year memories forever.
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm space-y-2">
               <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button asChild size="lg" className="w-full">
                    <Link href="/login">Create My Page Now</Link>
                  </Button>
               </motion.div>
            </div>
          </motion.div>
        </section>
      </main>
      <footer className="flex items-center justify-center w-full h-20 bg-black">
        <p className="text-sm text-zinc-400">
          &copy; {new Date().getFullYear()} SignPen. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
