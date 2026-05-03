import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SafeWithdraw",
  description:
    "SafeWithdraw — sachez exactement combien vous pouvez retirer en toute sécurité de votre activité freelance.",
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
