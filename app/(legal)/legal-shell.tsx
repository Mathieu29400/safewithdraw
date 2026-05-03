import Link from "next/link";
import type { ReactNode } from "react";

interface LegalShellProps {
  title: string;
  updatedAt: string;
  children: ReactNode;
}

export function LegalShell({ title, updatedAt, children }: LegalShellProps) {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(16,185,129,0.16),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-slate-100 transition hover:text-emerald-300"
          >
            SafeWithdraw
          </Link>
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-slate-100"
          >
            ← Retour
          </Link>
        </header>

        <article className="mt-12 sm:mt-16">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Dernière mise à jour : {updatedAt}
          </p>

          <div className="legal-content mt-10 space-y-10 text-slate-300">
            {children}
          </div>
        </article>
      </div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      <div className="space-y-3 text-base leading-relaxed text-slate-300">
        {children}
      </div>
    </section>
  );
}
