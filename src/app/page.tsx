
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
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
      <main className="flex-1">
        {/* Hero Section with Gradient Background */}
        <motion.section 
          className="w-full relative py-24 md:py-32 lg:py-40 overflow-hidden"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
            <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-accent/10 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '4s' }}></div>
          </div>

          <div className="container px-4 md:px-6 relative z-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px] items-center">
               <div className="lg:order-last">
                 <motion.div 
                   className="rounded-2xl overflow-hidden shadow-2xl border border-border/50 backdrop-blur-sm bg-card/80"
                   variants={featureImageVariants}
                 >
                   <SignatureGallery signatures={mockSignatures} isPublic={true} />
                 </motion.div>
               </div>
              <div className="flex flex-col justify-center space-y-6">
                <motion.div className="space-y-4" variants={itemVariants}>
                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                    <span className="block font-sacramento text-7xl md:text-8xl text-primary mb-2">Your</span>
                    <span className="block bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-primary">
                      Digital Yearbook
                    </span>
                  </h1>
                  <p className="max-w-[600px] text-lg md:text-xl text-foreground/80 leading-relaxed">
                    Create a personalized page, share it with friends, and collect beautiful digital signatures and memories in a single, interactive canvas.
                  </p>
                </motion.div>
                <motion.div 
                  className="flex flex-col gap-3 min-[400px]:flex-row"
                  variants={itemVariants}
                >
                  <Button 
                    asChild 
                    size="lg"
                    className="bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl text-base font-semibold group"
                  >
                    <Link href="/login" className="flex items-center gap-2">
                      Create Your Page
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Features Section */}
        <section className="w-full py-16 md:py-28 lg:py-32 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-card/50 to-background" style={{ backgroundImage: 'linear-gradient(135deg, rgba(22, 163, 74, 0.05) 0%, rgba(249, 115, 22, 0.05) 100%)' }}></div>
          
          <div className="container px-4 md:px-6 relative z-10">
            <motion.div 
              className="flex flex-col items-center justify-center space-y-4 text-center mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={containerVariants}
            >
              <motion.div 
                className="inline-block rounded-full bg-primary/10 text-primary px-4 py-2 text-sm font-semibold border border-primary/20" 
                variants={itemVariants}
              >
                ✨ Key Features
              </motion.div>
              <motion.h2 
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight font-headline"
                variants={itemVariants}
              >
                <span className="font-pacifico text-5xl md:text-6xl text-secondary block mb-2">Modern</span>
                Graduation Memories
              </motion.h2>
              <motion.p 
                className="max-w-[800px] text-lg text-foreground/70 md:text-xl/relaxed"
                variants={itemVariants}
              >
                SignPen reinvents the traditional sign-out book with interactive and personal features designed for today&apos;s creators.
              </motion.p>
            </motion.div>

            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-3">
              {features.map((feature, index) => {
                const placeholder = PlaceHolderImages.find(p => p.id === feature.imageId);
                return (
                  <motion.div
                    key={feature.title}
                    className="group relative flex flex-col overflow-hidden rounded-2xl bg-card border border-border/50 backdrop-blur-sm hover:border-border transition-all duration-500 shadow-lg hover:shadow-2xl"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={itemVariants}
                    whileHover={{ translateY: -8 }}
                  >
                    {/* Card background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    
                    {/* Image Container */}
                    <motion.div 
                      className="w-full aspect-video overflow-hidden bg-muted relative"
                      variants={featureImageVariants}
                    >
                      {placeholder && (
                        <Image
                          src={placeholder.imageUrl}
                          alt={feature.title}
                          width={600}
                          height={400}
                          data-ai-hint={placeholder.imageHint}
                          className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500"
                        />
                      )}
                    </motion.div>

                    {/* Content */}
                    <div className="relative flex flex-col flex-1 p-6 gap-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary/80 text-white shadow-lg">
                        <feature.icon className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold font-headline text-foreground mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-foreground/70 leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-20 md:py-28 lg:py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10"></div>
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>

          <motion.div 
            className="container grid items-center justify-center gap-6 px-4 text-center md:px-6 relative z-10"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            variants={containerVariants}
          >
            <motion.div className="space-y-4 max-w-2xl mx-auto" variants={itemVariants}>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                <span className="font-pacifico text-5xl md:text-6xl text-secondary block mb-2">Ready?</span>
                Start Your Journey
              </h2>
              <p className="text-lg md:text-xl text-foreground/70 leading-relaxed">
                Your unique sign-out page is just a click away. Preserve your final year memories forever in an interactive canvas that celebrates your journey.
              </p>
            </motion.div>
            <motion.div className="mx-auto w-full max-w-sm" variants={itemVariants}>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} className="w-full">
                <Button 
                  asChild 
                  size="lg" 
                  className="w-full bg-gradient-to-r from-primary to-secondary hover:shadow-2xl text-white shadow-xl rounded-xl text-base font-semibold transition-all duration-300 group"
                >
                  <Link href="/login" className="flex items-center justify-center gap-2">
                    Create My Page Now
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        </section>
      </main>

      {/* Modern Footer */}
      <footer className="w-full border-t border-border/50 bg-card backdrop-blur-sm">
        <div className="container px-4 md:px-6 py-8 md:py-12">
          <motion.div
            className="flex flex-col items-center justify-center gap-4 text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={containerVariants}
          >
            <motion.div className="flex items-center gap-2" variants={itemVariants}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                S
              </div>
              <span className="font-bold text-lg">SignPen</span>
            </motion.div>
            <motion.p className="text-sm text-foreground/60" variants={itemVariants}>
              &copy; {new Date().getFullYear()} SignPen. Celebrating memories, one signature at a time.
            </motion.p>
          </motion.div>
        </div>
      </footer>
    </div>
  );
}
