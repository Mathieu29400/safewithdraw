"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

export type TransactionType = "income" | "withdrawal";

type Props = {
  type: TransactionType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Called after a successful insert. Lets the parent refresh its list. */
  onCreated?: () => void;
};

/**
 * Quick-entry modal for transactions. Uses the native <dialog> element
 * so we get focus management, Esc-to-close and a backdrop for free.
 *
 * The user can pick any past date — this is by design, freelancers need to
 * backfill data from before they signed up.
 */
export function AddTransactionDialog({
  type,
  open,
  onOpenChange,
  userId,
  onCreated,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>(todayLocalIso);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Note: no reset-on-close effect needed — the parent conditionally renders
  // this dialog, so closing unmounts the component and useState wipes itself.

  const handleClose = () => onOpenChange(false);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) handleClose();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
      setError("Saisissez un montant supérieur à 0 (ex : 1500.00).");
      return;
    }

    const isoDate = parseLocalDateToIso(date);
    if (!isoDate) {
      setError("Date invalide.");
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: userId,
      type,
      amount: parsedAmount,
      created_at: isoDate,
    });

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    onCreated?.();
    onOpenChange(false);
  };

  const isIncome = type === "income";
  const title = isIncome ? "Ajouter une entrée" : "Ajouter un retrait";
  const submitLabel = isIncome
    ? "Enregistrer l’entrée"
    : "Enregistrer le retrait";
  const submitClass = isIncome
    ? "bg-emerald-500 hover:bg-emerald-400 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]"
    : "bg-white/10 hover:bg-white/15 ring-1 ring-white/10";

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="w-full max-w-md rounded-2xl bg-slate-950/95 p-0 text-slate-100 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop:bg-black/70 backdrop:backdrop-blur-md"
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            className="-m-1 rounded p-1 text-2xl leading-none text-slate-500 hover:text-slate-200"
          >
            ×
          </button>
        </div>

        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-slate-300"
          >
            Montant (€)
          </label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        <div>
          <label
            htmlFor="date"
            className="block text-sm font-medium text-slate-300"
          >
            Date
          </label>
          <input
            id="date"
            type="date"
            required
            value={date}
            max={todayLocalIso()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 [color-scheme:dark]"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Vous pouvez saisir une date passée pour rattraper vos données.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-300 shadow-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${submitClass}`}
          >
            {submitting ? "Enregistrement…" : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** YYYY-MM-DD in the user's local timezone — what `<input type="date">` expects. */
function todayLocalIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a "YYYY-MM-DD" local-date string to an ISO timestamp.
 * We anchor at 12:00 UTC to avoid timezone edge cases that would push
 * the row into the previous or next day for users far from UTC.
 */
function parseLocalDateToIso(localDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
