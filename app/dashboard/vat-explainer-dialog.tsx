"use client";

/**
 * VatExplainerDialog — the pedagogical modal explaining what the VAT
 * seuil de franchise is, with a concrete chiffré example tailored to
 * the user's actual category.
 *
 * Shared between the dashboard widget (where it opens on click /
 * "En savoir plus") and any future surface that needs the same
 * explainer. Kept presentational only — no Supabase, no math. The
 * caller passes in the resolved `VatStatus` and we render whatever
 * makes sense for the user's situation.
 *
 * Visual tone:
 *   - emerald-tinted card for the pedagogical content
 *   - sky-tinted card when the user is already VAT-registered (rare
 *     since the dashboard widget hides itself in that state, but we
 *     handle it to keep the component robust as a standalone surface).
 */

import { useEffect, useRef } from "react";
import { CheckCircle, InfoCircle } from "react-bootstrap-icons";

import type { VatStatus } from "@/lib/vat";

export function VatExplainerDialog({
  open,
  onOpenChange,
  vat,
  activityLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vat: VatStatus;
  activityLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => onOpenChange(false);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) handleClose();
  };

  const isRegistered = vat.level === "registered";
  const thresholdFmt = vat.threshold.toLocaleString("fr-FR");

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="w-full max-w-lg rounded-2xl bg-slate-950/95 p-0 text-slate-100 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop:bg-black/70 backdrop:backdrop-blur-md"
    >
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">
            {isRegistered ? "Tu es déjà à la TVA" : "Le seuil de TVA, c’est quoi ?"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            className="-m-1 rounded p-1 text-2xl leading-none text-slate-500 transition hover:text-slate-200"
          >
            ×
          </button>
        </div>

        {isRegistered ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-5 ring-1 ring-sky-400/20">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30"
              >
                <CheckCircle size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-sky-100/95">
                  Tu as déclaré que tu factures déjà la TVA à tes clients —
                  SafeWithdraw ne te montre donc pas d’alerte de seuil. Tu
                  peux changer ce réglage à tout moment depuis{" "}
                  <span className="font-medium">Mon compte</span>.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/[0.18] p-5 ring-1 ring-emerald-400/20">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
                >
                  <InfoCircle size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-emerald-50/95">
                    En micro-entreprise, tu es{" "}
                    <strong>exonéré de TVA</strong> jusqu’à un certain
                    chiffre d’affaires annuel. Dans ton cas (
                    <span className="font-medium text-emerald-100">
                      {activityLabel}
                    </span>
                    ), ton seuil est de{" "}
                    <span className="font-mono font-semibold text-emerald-100">
                      {thresholdFmt} € HT
                    </span>{" "}
                    par an. Dès que tu le dépasses,{" "}
                    <strong>
                      tu dois facturer la TVA à tes clients dès le jour
                      suivant
                    </strong>
                    .
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-white/10">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  Avant le seuil
                </p>
                <p className="mt-1.5 text-sm text-slate-100">
                  Tu factures{" "}
                  <span className="font-mono font-semibold">1 000 €</span>{" "}
                  → ton client paie{" "}
                  <span className="font-mono font-semibold">1 000 €</span>.
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-amber-400/25">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-300">
                  Après le seuil
                </p>
                <p className="mt-1.5 text-sm text-slate-100">
                  Tu factures{" "}
                  <span className="font-mono font-semibold">1 000 €</span>{" "}
                  HT → ton client paie{" "}
                  <span className="font-mono font-semibold">1 200 €</span>{" "}
                  (TVA 20 %). Tu reverses{" "}
                  <span className="font-mono font-semibold">200 €</span> à
                  l’État.
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-300">
              <strong className="text-slate-100">
                SafeWithdraw surveille ton seuil pour toi
              </strong>{" "}
              et te prévient bien en amont — pas de mauvaise surprise. Tu
              pourras alors anticiper, prévenir tes clients ou décider
              d’opter volontairement à la TVA si c’est dans ton intérêt.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            J’ai compris
          </button>
        </div>
      </div>
    </dialog>
  );
}
