"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    setInfo(null);

    if (email !== confirmEmail) {
      setError("Les adresses email ne correspondent pas.");
      return;
    }

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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) {
      setError(translateAuthError(signUpError.message));
      setLoading(false);
      return;
    }

    if (data.session) {
      console.log("[signup] Signup success, sending welcome email to:", email);
      fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
        .then((res) => res.json())
        .then((json) => console.log("[signup] send-welcome response:", json))
        .catch((err) => console.error("[signup] send-welcome fetch error:", err));
      router.replace("/dashboard");
      return;
    }

    setLoading(false);
    setInfo(
      "Compte créé. Un email de confirmation vous a été envoyé : cliquez sur le lien reçu pour activer votre compte."
    );
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
            Créer un compte SafeWithdraw
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sachez exactement combien vous pouvez retirer de votre activité, en
            toute sécurité.
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
              <label
                htmlFor="confirmEmail"
                className="block text-sm font-medium text-slate-300"
              >
                Confirmer l&apos;email
              </label>
              <input
                id="confirmEmail"
                name="confirmEmail"
                type="email"
                autoComplete="email"
                required
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className={`mt-1.5 block w-full rounded-lg border bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 transition ${
                  confirmEmail.length > 0 && email !== confirmEmail
                    ? "border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20"
                    : confirmEmail.length > 0 && email === confirmEmail
                      ? "border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                      : "border-white/10 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                }`}
                placeholder="Confirme ton email"
              />
              {confirmEmail.length > 0 && email === confirmEmail && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-500">
                  <span aria-hidden>✓</span> Les adresses correspondent.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300"
              >
                Mot de passe
              </label>
              <input
                id="password"
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
                Au moins 8 caractères, incluant une majuscule, une minuscule et
                un chiffre.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-300"
              >
                Confirmer le mot de passe
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`mt-1.5 block w-full rounded-lg border bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:outline-none focus:ring-2 transition ${
                  confirmPassword.length > 0 && password !== confirmPassword
                    ? "border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20"
                    : confirmPassword.length > 0 && password === confirmPassword
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

            {info && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Création…" : "Créer mon compte"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
          >
            Se connecter
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

function translateAuthError(message: string): string {
  if (/already registered|already exists|user already/i.test(message)) {
    return "Un compte existe déjà avec cet email.";
  }
  if (/password.*(short|characters|length|weak|strength|requirement)/i.test(message)) {
    return "Le mot de passe est trop faible. Il doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.";
  }
  if (/invalid email/i.test(message)) {
    return "Adresse email invalide.";
  }
  return message;
}
