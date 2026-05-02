"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Returns once the new period has been successfully persisted. Any
   * thrown error (RLS denial, network, validation) is caught and
   * rendered inline instead of silently swallowed.
   */
  onConfirm: () => Promise<void> | void;
};

export function NewPeriodDialog({ open, onOpenChange, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No reset effect is needed for `submitting` / `error`: the parent
  // dashboard conditionally renders this dialog (`{open && <Dialog>}`),
  // so each "open" is a fresh mount and the `useState` initial values
  // give us a clean slate automatically.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) handleClose();
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur inconnue";
      // Surfaced inline AND in the console — the latter helps when
      // tracking issues from screenshots / shared sessions.
      console.error("[new-period] insert failed:", err);
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="w-full max-w-md rounded-2xl bg-slate-950/95 p-0 text-slate-100 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop:bg-black/70 backdrop:backdrop-blur-md"
    >
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            Confirmer la nouvelle période
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Fermer"
            className="-m-1 rounded p-1 text-2xl leading-none text-slate-500 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ×
          </button>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <p className="text-sm leading-relaxed text-slate-300">
            Tu es sur le point de clôturer ta période URSSAF actuelle et
            d&apos;en démarrer une nouvelle. Le chiffre d&apos;affaires,
            l&apos;URSSAF estimée, la réserve et les retraits de la période
            repartiront de zéro. Ton historique global sera conservé.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            Impossible de créer la période : {error}
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
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Création…" : "Confirmer"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
