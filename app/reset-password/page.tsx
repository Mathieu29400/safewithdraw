"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase exchanges the token in the URL hash and fires PASSWORD_RECOVERY.
  // We wait for that event before showing the form so we know the session
  // is live and updateUser() will work.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" && session) {
          setReady(true);
        }
      },
    );
    // If the user already has a session from the magic-link click, mark ready.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 2500);
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
            Nouveau mot de passe
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>

          {done ? (
            <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
              Mot de passe mis à jour. Redirection vers le tableau de bord…
            </div>
          ) : !ready ? (
            <p className="mt-6 text-sm text-slate-400">
              Vérification du lien en cours…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium text-slate-300"
                >
                  Nouveau mot de passe
                </label>
                <input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="••••••••"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Au moins 8 caractères, incluant une majuscule, une minuscule
                  et un chiffre.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="block text-sm font-medium text-slate-300"
                >
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirm-new-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`mt-1.5 block w-full rounded-lg border bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 transition ${
                    confirmPassword.length > 0 && password !== confirmPassword
                      ? "border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20"
                      : confirmPassword.length > 0 &&
                          password === confirmPassword
                        ? "border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                        : "border-white/10 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                  }`}
                  placeholder="Confirme ton mot de passe"
                />
                {confirmPassword.length > 0 && password === confirmPassword && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-500">
                    <span aria-hidden>✓</span> Les mots de passe correspondent.
                  </p>
                )}
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
                {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link
            href="/login"
            className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            ← Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (!/[a-z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une minuscule.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une majuscule.";
  }
  if (!/[0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins un chiffre.";
  }
  return null;
}
