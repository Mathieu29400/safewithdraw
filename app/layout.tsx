import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.safewithdraw.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "SafeWithdraw — Combien tu peux te verser, à tout moment",
    template: "%s · SafeWithdraw",
  },
  description:
    "SafeWithdraw calcule en temps réel le montant que tu peux retirer de ton activité freelance sans risque. Calcul URSSAF automatique, réserve de sécurité incluse. Essai gratuit 30 jours, sans carte.",
  applicationName: "SafeWithdraw",
  keywords: [
    "freelance",
    "auto-entrepreneur",
    "URSSAF",
    "trésorerie",
    "retrait",
    "micro-entreprise",
    "calcul URSSAF",
    "gestion freelance",
  ],
  authors: [{ name: "SafeWithdraw" }],
  creator: "SafeWithdraw",
  publisher: "SafeWithdraw",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: siteUrl,
    siteName: "SafeWithdraw",
    title:
      "SafeWithdraw — Combien tu peux te verser, à tout moment",
    description:
      "Calcul URSSAF automatique, réserve de sécurité incluse. Sache exactement combien retirer sans risque. Essai gratuit 30 jours.",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "SafeWithdraw — Combien tu peux te verser, à tout moment",
    description:
      "Calcul URSSAF automatique, réserve de sécurité incluse. Essai gratuit 30 jours, sans carte.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-slate-100">
        {children}
        <Analytics />
        <footer className="mt-auto border-t border-white/[0.06] py-6 text-center text-sm text-slate-500">
          <p>
            Une question ?{" "}
            <a
              href="mailto:safewithdraw.contact@gmail.com"
              className="text-slate-400 transition hover:text-slate-200 hover:underline"
            >
              safewithdraw.contact@gmail.com
            </a>
          </p>
          <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <a
              href="/terms"
              className="transition hover:text-slate-300 hover:underline"
            >
              Conditions d&apos;utilisation
            </a>
            <span aria-hidden className="text-slate-700">·</span>
            <a
              href="/privacy"
              className="transition hover:text-slate-300 hover:underline"
            >
              Confidentialité
            </a>
            <span aria-hidden className="text-slate-700">·</span>
            <a
              href="/refund"
              className="transition hover:text-slate-300 hover:underline"
            >
              Remboursement
            </a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
