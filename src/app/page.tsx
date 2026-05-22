
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
      {/* Navigation Header */}
      <motion.header 
        className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="container mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <motion.div className="flex items-center gap-2 group" whileHover={{ scale: 1.05 }}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
              S
            </div>
            <span className="text-xl font-bold font-headline group-hover:text-primary transition-colors">SignPen</span>
          </motion.div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-foreground/70 hover:text-foreground transition-colors">Features</a>
            <a href="#cta" className="text-foreground/70 hover:text-foreground transition-colors">CTA</a>
          </nav>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              asChild 
              size="lg"
              className="rounded-lg font-semibold"
            >
              <Link href="/login">Get Started</Link>
            </Button>
          </motion.div>
        </div>
      </motion.header>

      <main className="flex-1">
        {/* Hero Section */}
        <motion.section 
          className="section-light relative overflow-hidden"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {/* Background decorations */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
          </div>

          <div className="container mx-auto px-4 md:px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Content Box */}
              <motion.div 
                className="flex flex-col justify-center space-y-6"
                variants={itemVariants}
              >
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                    <span className="block font-sacramento text-6xl md:text-7xl text-primary mb-2">Your</span>
                    <span className="block bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-primary">
                      Digital Yearbook
                    </span>
                  </h1>
                  <p className="text-lg text-foreground/70 leading-relaxed max-w-lg">
                    Create a personalized page, share it with friends, and collect beautiful digital signatures and memories in a single, interactive canvas.
                  </p>
                </div>
                <motion.div 
                  className="flex flex-col sm:flex-row gap-3 pt-4"
                  variants={itemVariants}
                >
                  <Button 
                    asChild 
                    size="lg"
                    className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all group"
                  >
                    <Link href="/login" className="flex items-center justify-center gap-2">
                      Create Your Page
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>

              {/* Right Preview Box */}
              <motion.div 
                className="hidden lg:block"
                variants={featureImageVariants}
              >
                <div className="glass-card">
                  <SignatureGallery signatures={mockSignatures} isPublic={true} />
                </div>
              </motion.div>
            </div>
          </div>
        </motion.section>

        {/* Features Section */}
        <motion.section 
          className="section-accent"
          id="features"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={containerVariants}
        >
          <div className="container mx-auto px-4 md:px-6 relative z-10">
            {/* Section Header */}
            <motion.div 
              className="text-center mb-20"
              variants={containerVariants}
            >
              <motion.div 
                className="inline-block rounded-full bg-primary/10 text-primary px-4 py-2 text-sm font-semibold border border-primary/20 mb-4" 
                variants={itemVariants}
              >
                Key Features
              </motion.div>
              <motion.h2 
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                variants={itemVariants}
              >
                <span className="font-pacifico text-5xl md:text-6xl text-secondary">Modern</span>
                {' '}Graduation Memories
              </motion.h2>
              <motion.p 
                className="max-w-2xl mx-auto text-lg text-foreground/70"
                variants={itemVariants}
              >
                SignPen reinvents the traditional sign-out book with interactive and personal features designed for today&apos;s creators.
              </motion.p>
            </motion.div>

            {/* Features Grid */}
            <div className="grid lg:grid-cols-3 gap-8">
              {features.map((feature) => {
                const placeholder = PlaceHolderImages.find(p => p.id === feature.imageId);
                return (
                  <motion.div
                    key={feature.title}
                    className="group card-box flex flex-col h-full overflow-hidden"
                    variants={itemVariants}
                    whileHover={{ translateY: -8 }}
                  >
                    {/* Image Container */}
                    <motion.div 
                      className="w-full aspect-video overflow-hidden bg-muted relative rounded-t-xl -m-6 mb-6 md:p-0"
                      whileHover={{ scale: 1.05 }}
                    >
                      {placeholder && (
                        <Image
                          src={placeholder.imageUrl}
                          alt={feature.title}
                          width={600}
                          height={400}
                          data-ai-hint={placeholder.imageHint}
                          className="object-cover w-full h-full transition-transform duration-500"
                        />
                      )}
                    </motion.div>

                    {/* Content */}
                    <div className="flex flex-col flex-1 space-y-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center shadow-lg">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-foreground mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-foreground/70 leading-relaxed text-base">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.section>

        {/* CTA Section */}
        <motion.section 
          className="section-dark relative overflow-hidden"
          id="cta"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={containerVariants}
        >
          {/* Background elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
          </div>

          <div className="container mx-auto px-4 md:px-6 relative z-10">
            <motion.div className="max-w-3xl mx-auto text-center space-y-8" variants={containerVariants}>
              <motion.div className="space-y-4" variants={itemVariants}>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                  <span className="font-pacifico text-5xl md:text-6xl text-secondary block mb-2">Ready?</span>
                  Start Your Journey
                </h2>
                <p className="text-lg text-foreground/70 leading-relaxed">
                  Your unique sign-out page is just a click away. Preserve your final year memories forever in an interactive canvas that celebrates your journey.
                </p>
              </motion.div>

              <motion.div 
                className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
                variants={itemVariants}
              >
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }} className="flex-1 sm:flex-none">
                  <Button 
                    asChild 
                    size="lg" 
                    className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all group"
                  >
                    <Link href="/login" className="flex items-center justify-center gap-2">
                      Create My Page Now
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
          <motion.div
            className="flex flex-col md:flex-row items-center justify-between gap-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={containerVariants}
          >
            <motion.div className="flex items-center gap-3" variants={itemVariants}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
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
