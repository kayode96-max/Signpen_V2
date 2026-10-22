"use client";

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';
import Image from 'next/image';
import heroPoster from '@/assets/hero-poster.webp';

const HERO_VIDEO_SRC = '/images/vid1.d685294af0.mp4';

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

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

function blocksAutoplay(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return (
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g' ||
    connection.effectiveType === '3g'
  );
}

function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

const HeroVideo = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const attachAndPlay = (video: HTMLVideoElement) => {
    video.muted = true;
    video.defaultMuted = true;
    video.preload = 'none';
    if (!video.getAttribute('src')) {
      video.src = HERO_VIDEO_SRC;
    }
    const pending = video.play();
    if (pending) {
      pending.catch(() => {
        setHasStarted(false);
      });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;
    if (isMobileViewport() || blocksAutoplay()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries.some((entry) => entry.isIntersecting);
        if (!inView || !videoRef.current) return;
        if (isMobileViewport() || blocksAutoplay()) return;
        attachAndPlay(videoRef.current);
        observer.disconnect();
      },
      { threshold: 0.25 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    attachAndPlay(video);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: '16 / 9' }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        preload="none"
        muted
        loop
        playsInline
        width={1920}
        height={1080}
        aria-label="SignPen product preview"
        onPlaying={() => setHasStarted(true)}
      />
      {!hasStarted && (
        <>
          <Image
            src={heroPoster}
            alt=""
            width={heroPoster.width}
            height={heroPoster.height}
            sizes="(min-width: 1280px) 600px, (min-width: 1024px) 400px, 100vw"
            priority
            className="absolute inset-0 z-10 h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Play video"
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
              <Play className="h-7 w-7 fill-current" aria-hidden="true" />
            </span>
          </button>
        </>
      )}
    </div>
  );
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
            <HeroVideo />
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
