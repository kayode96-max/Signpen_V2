
'use client'

import { Button } from "@/components/ui/button";
import { Paintbrush, Sparkles, Download, ArrowRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { mockSignatures } from "@/lib/mock-data";
import dynamic from "next/dynamic";


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
      ease: "easeOut"
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
      ease: [0.25, 1, 0.5, 1]
    }
  }
}

const features = [
  {
    icon: Paintbrush,
    title: "Interactive Canvas",
    description: "Your personal, zoomable canvas where friends can leave their mark on a shared digital space.",
    imageId: "feature-canvas"
  },
  {
    icon: Sparkles,
    title: "Creative Signing Tools",
    description: "Express yourself with various pens, creative fonts, and a palette of colors to make your signature unique.",
    imageId: "feature-creative"
  },
  {
    icon: Download,
    title: "A Forever Keepsake",
    description: "Export your entire board as a high-resolution image or PDF, preserving your memories forever.",
    imageId: "feature-download"
  }
]

// Dynamically import SignatureGallery with SSR turned off
const SignatureGallery = dynamic(() => import('@/components/signature/signature-gallery'), {
  ssr: false,
});


export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <main className="flex-1">
        <motion.section 
          className="w-full py-24 md:py-32 lg:py-40"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
               <div className="lg:order-last">
                 <SignatureGallery signatures={mockSignatures} isPublic={true} />
               </div>
              <div className="flex flex-col justify-center space-y-4">
                <motion.div className="space-y-4" variants={itemVariants}>
                  <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none font-headline bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary">
                    Your Digital Yearbook, Reimagined.
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
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
                    <Link href="/login">Create Your Page <ArrowRight className="ml-2" /></Link>
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.section>

        <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary">
          <div className="container px-4 md:px-6">
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
              <motion.h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline" variants={itemVariants}>
                A New Era of Graduation Memories
              </motion.h2>
              <motion.p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed" variants={itemVariants}>
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
                    className="flex flex-col items-center text-center gap-4"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={itemVariants}
                  >
                     <motion.div 
                        className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl border-4 border-background"
                        variants={featureImageVariants}
                      >
                       {placeholder && (
                          <Image
                            src={placeholder.imageUrl}
                            alt={feature.title}
                            width={600}
                            height={400}
                            data-ai-hint={placeholder.imageHint}
                            className="object-cover w-full h-full"
                          />
                        )}
                      </motion.div>
                    <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary -mt-8 relative border-4 border-secondary">
                      <feature.icon className="h-8 w-8" />
                    </div>
                    <div className="grid gap-1">
                      <h3 className="text-2xl font-bold font-headline">{feature.title}</h3>
                      <p className="text-muted-foreground max-w-xs mx-auto">
                        {feature.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="w-full py-20 md:py-28 lg:py-32">
          <motion.div 
            className="container grid items-center justify-center gap-4 px-4 text-center md:px-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            variants={itemVariants}
          >
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight font-headline">
                Ready to Start Collecting Memories?
              </h2>
              <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
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
      <footer className="flex items-center justify-center w-full h-20 border-t bg-secondary">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} SignPen. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
