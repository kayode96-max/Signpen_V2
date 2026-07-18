"use client";

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Paintbrush, Sparkles, Download } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

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

const featureImageVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.7,
      ease: [0.25, 1, 0.5, 1],
    },
  },
};

const features = [
  {
    icon: Paintbrush,
    title: "Interactive Canvas",
    description: "Your personal, zoomable canvas where friends can leave their mark on a shared digital space.",
    imageId: "feature-canvas",
  },
  {
    icon: Sparkles,
    title: "Creative Signing Tools",
    description: "Express yourself with various pens, creative fonts, and a palette of colors to make your signature unique.",
    imageId: "feature-creative",
  },
  {
    icon: Download,
    title: "A Forever Keepsake",
    description: "Export your entire board as a high-resolution image or PDF, preserving your memories forever.",
    imageId: "feature-download",
  },
];

const Features = () => {
  return (
    <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-transparent">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div 
          className="flex flex-col items-center justify-center space-y-4 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={containerVariants}
        >
          <motion.div className="inline-block rounded-lg bg-primary/10 text-primary px-3 py-1 text-sm font-medium" variants={itemVariants}>
            Key Features
          </motion.div>
          <motion.h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline text-white" variants={itemVariants}>
            A New Era of Graduation Memories
          </motion.h2>
          <motion.p className="max-w-[900px] text-zinc-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed" variants={itemVariants}>
            SignPen reinvents the traditional sign-out book with a suite
            of interactive and personal features designed for today.
          </motion.p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl items-center gap-12 md:gap-16 lg:grid-cols-3 lg:max-w-none mt-16">
          {features.map((feature, index) => {
            const placeholder = PlaceHolderImages.find(p => p.id === feature.imageId);
            return (
              <motion.div
                key={feature.title}
                className="flex flex-col items-center text-center gap-4 group cursor-pointer"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={itemVariants}
              >
                <motion.div 
                  className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl border-4 border-zinc-800 bg-zinc-900 transition-all duration-500 group-hover:border-primary group-hover:shadow-primary/20"
                  variants={featureImageVariants}
                >
                  {placeholder && (
                    <Image
                      src={placeholder.imageUrl}
                      alt={feature.title}
                      width={600}
                      height={400}
                      data-ai-hint={placeholder.imageHint}
                      className="object-cover w-full h-full transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  )}
                </motion.div>
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary -mt-8 relative border-4 border-zinc-950 transition-all duration-500 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110">
                  <feature.icon className="h-8 w-8" />
                </div>
                <div className="grid gap-1">
                  <h3 className="text-2xl font-bold font-headline text-white transition-colors duration-300 group-hover:text-primary">{feature.title}</h3>
                  <p className="text-zinc-400 max-w-xs mx-auto text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;