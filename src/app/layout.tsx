
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from "@/firebase";
import {
  Alegreya,
  Inter,
  Caveat,
  Dancing_Script,
  Indie_Flower,
  Pacifico,
  Source_Code_Pro,
  Great_Vibes,
  Sacramento,
  Monsieur_La_Doulaise,
  UnifrakturMaguntia,
  Alex_Brush,
  Allura,
  Cookie,
  Kaushan_Script,
  Marck_Script,
  Satisfy,
  Yellowtail,
  Parisienne,
  Tangerine,
  Italianno,
  Nothing_You_Could_Do,
  Cedarville_Cursive,
} from 'next/font/google'
import Image from "next/image";

export const metadata: Metadata = {
  title: "SignPen",
  description:
    "Your Digital Final Year Sign-Out Book. Sign on an interactive board or a rotating 3-D T-Shirt.",
};

const alegreya = Alegreya({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-headline',
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const caveat = Caveat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-caveat',
});

const dancingScript = Dancing_Script({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dancing-script',
});

const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-pacifico',
});

const indieFlower = Indie_Flower({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    variable: '--font-indie-flower'
});

const sourceCodePro = Source_Code_Pro({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-source-code-pro'
})

const greatVibes = Great_Vibes({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    variable: '--font-great-vibes'
})

const sacramento = Sacramento({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    variable: '--font-sacramento'
})

const monsieurLaDoulaise = Monsieur_La_Doulaise({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    variable: '--font-monsieur-la-doulaise'
})

const unifrakturMaguntia = UnifrakturMaguntia({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    variable: '--font-unifraktur-maguntia'
})

const alexBrush = Alex_Brush({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-alex-brush'
})

const allura = Allura({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-allura'
})

const cookie = Cookie({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-cookie'
})

const kaushanScript = Kaushan_Script({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-kaushan-script'
})

const marckScript = Marck_Script({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-marck-script'
})

const satisfy = Satisfy({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-satisfy'
})

const yellowtail = Yellowtail({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-yellowtail'
})

const parisienne = Parisienne({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-parisienne'
})

const tangerine = Tangerine({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-tangerine'
})

const italianno = Italianno({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-italianno'
})

const nothingYouCouldDo = Nothing_You_Could_Do({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-nothing-you-could-do'
})

const cedarvilleCursive = Cedarville_Cursive({
    subsets: ['latin'],
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-cedarville-cursive'
})


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${alegreya.variable} ${inter.variable} ${caveat.variable} ${dancingScript.variable} ${pacifico.variable} ${indieFlower.variable} ${sourceCodePro.variable} ${greatVibes.variable} ${sacramento.variable} ${monsieurLaDoulaise.variable} ${unifrakturMaguntia.variable} ${alexBrush.variable} ${allura.variable} ${cookie.variable} ${kaushanScript.variable} ${marckScript.variable} ${satisfy.variable} ${yellowtail.variable} ${parisienne.variable} ${tangerine.variable} ${italianno.variable} ${nothingYouCouldDo.variable} ${cedarvilleCursive.variable}`}>
      <head>
          <link rel="icon" href="/images/signpen.png" type="image/png" />

      </head>
      <body
        className={cn("min-h-screen bg-background font-body antialiased")}
      >
        <FirebaseClientProvider>
          <main>{children}</main>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
