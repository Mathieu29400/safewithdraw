"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) router.replace("/dashboard");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(translateAuthError(signInError.message));
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
  };

  if (showForgot) {
    return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-2xl font-semibold tracking-tight text-slate-100"
          >
            SafeWithdraw
          </Link>
        </div>

        <div className="card-soft rounded-2xl bg-slate-900/50 p-8 ring-1 ring-white/10 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Connexion à SafeWithdraw
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Accédez à votre tableau de bord.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="vous@exemple.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-300"
                >
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-slate-400 hover:text-emerald-400 hover:underline focus:outline-none"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Pas encore de compte ?{" "}
          <Link
            href="/signup"
            className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </div>
    </main>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: "https://safewithdraw.app/reset-password" },
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-2xl font-semibold tracking-tight text-slate-100"
          >
            SafeWithdraw
          </Link>
        </div>

        <div className="card-soft rounded-2xl bg-slate-900/50 p-8 ring-1 ring-white/10 backdrop-blur-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Mot de passe oublié
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>

          {sent ? (
            <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
              Email envoyé pour réinitialiser ton mot de passe. Vérifie ta boîte
              de réception.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-slate-300"
                >
                  Email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="vous@exemple.com"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Envoi…" : "Réinitialiser le mot de passe"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          <button
            type="button"
            onClick={onBack}
            className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline focus:outline-none"
          >
            ← Retour à la connexion
          </button>
        </p>
      </div>
    </main>
  );
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "Email ou mot de passe incorrect.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Veuillez confirmer votre email avant de vous connecter.";
  }
  return message;
}
