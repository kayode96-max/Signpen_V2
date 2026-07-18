"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

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

const Hero = () => {
  return (
    <motion.section 
      className="w-full py-24 md:py-32 lg:py-40"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
          <div className="lg:order-last">
            <video src="/images/vid1.mp4" autoPlay muted loop></video>
          </div>
          <div className="flex flex-col justify-center space-y-4">
            <motion.div className="space-y-4" variants={itemVariants}>
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none font-headline bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary">
                Your Digital Yearbook, Reimagined.
              </h1>
              <p className="max-w-[600px] text-zinc-400 md:text-xl">
                Create a personalized page, share it with friends, and
                collect beautiful digital signatures and memories
                in a single, interactive canvas.
              </p>
            </motion.div>
            <motion.div 
              className="flex flex-col gap-2 min-[400px]:flex-row"
              variants={itemVariants}
            >
              <Button asChild size="lg">
                <Link href="/login">
                  Create Your Page <ArrowRight className="ml-2" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default Hero;