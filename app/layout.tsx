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
          Une question ?{" "}
          <a
            href="mailto:safewithdraw.contact@gmail.com"
            className="text-slate-400 transition hover:text-slate-200 hover:underline"
          >
            safewithdraw.contact@gmail.com
          </a>
        </footer>
      </body>
    </html>
  );
}
