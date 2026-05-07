"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Called after a successful insert. Lets the parent refresh its list. */
  onCreated?: () => void;
  /**
   * Optional `YYYY-MM-DD` pre-fill for the date picker. When omitted, falls
   * back to today's local date. See the income dialog for the rationale on
   * why we no longer auto-jump to the end of an archived period.
   */
  defaultDate?: string;
  /**
   * The URSSAF period the user is currently consulting. Same contract as
   * `AddTransactionDialog`'s `viewedPeriodRange` — when the entered date
   * falls outside this window, the dialog asks for an explicit confirm
   * before persisting. Pass `undefined` for the all-time view.
   */
  viewedPeriodRange?: { start: string; end?: string };
  /** Human-readable label of the viewed period, used in the warning banner. */
  viewedPeriodLabel?: string;
};

/**
 * Same VAT presets as the income dialog (see add-transaction-dialog.tsx).
 * Kept duplicated rather than shared so each dialog stays a self-contained
 * client component the parent can lazy-load independently.
 */
const VAT_PRESETS = [
  { label: "20 %", value: 0.2 },
  { label: "10 %", value: 0.1 },
  { label: "5,5 %", value: 0.055 },
] as const;

const DEFAULT_VAT_RATE = 0.2;

/**
 * Quick-entry modal for business expenses (advanced mode).
 *
 * Mirrors AddTransactionDialog so the UX feels consistent: native <dialog>
 * for free focus management & Esc-to-close, custom date allowed for
 * backfilling, and an optional description so the user can label what the
 * expense was for (subscription, hardware, fuel…). Description is stored
 * verbatim — the engine ignores it, this is purely for the user's records.
 *
 * Same VAT semantics as the income dialog: when the user ticks "TVA
 * récupérable", the entered amount is treated as TTC and the engine reduces
 * it to HT for the safe-withdrawal calculation. Only the HT portion counts
 * as a real expense; the recoverable VAT is surfaced informatively but does
 * not unlock additional withdrawable cash (the user reclaims it from the
 * tax authority instead).
 */
export function AddExpenseDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
  defaultDate,
  viewedPeriodRange,
  viewedPeriodLabel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<string>(() => defaultDate ?? todayLocalIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);

  // Two-step submit guard for period mismatches. See the matching block
  // in AddTransactionDialog for full rationale — the UX is identical so
  // a mistaken date in either dialog gets the same safety net.
  const [confirmingOutsidePeriod, setConfirmingOutsidePeriod] = useState(false);

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

  const ttcParsed = useMemo(() => parseAmount(amount), [amount]);
  const vatPreview = useMemo(() => {
    if (!vatEnabled || ttcParsed === null) return null;
    const ht = ttcParsed / (1 + vatRate);
    return { ht, vat: ttcParsed - ht };
  }, [vatEnabled, ttcParsed, vatRate]);

  const dateOutsidePeriod = useMemo(
    () => isDateOutsidePeriod(date, viewedPeriodRange),
    [date, viewedPeriodRange],
  );

  const handleDateChange = (next: string) => {
    setDate(next);
    setConfirmingOutsidePeriod(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
      setError("Saisissez un montant supérieur à 0 (ex : 49.99).");
      return;
    }

    // When the user keeps "today" as the date, store the EXACT current
    // timestamp instead of noon UTC. This mirrors AddTransactionDialog and
    // is critical right after a "Nouvelle période URSSAF" reset: the new
    // period starts at the click moment, so any new expense the user logs
    // today must land AFTER that moment to be included in the fresh KPI.
    // For past dates, keep the noon-UTC anchor (timezone-safe backfilling).
    const isoDate =
      date === todayLocalIso() ? new Date().toISOString() : parseLocalDateToIso(date);
    if (!isoDate) {
      setError("Date invalide.");
      return;
    }

    if (dateOutsidePeriod && !confirmingOutsidePeriod) {
      setConfirmingOutsidePeriod(true);
      return;
    }

    setSubmitting(true);
    const trimmedDescription = description.trim();
    const persistedVatRate = vatEnabled ? vatRate : null;
    const { error: insertError } = await supabase.from("expenses").insert({
      user_id: userId,
      amount: parsedAmount,
      description: trimmedDescription === "" ? null : trimmedDescription,
      created_at: isoDate,
      vat_rate: persistedVatRate,
    });

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    onCreated?.();
    onOpenChange(false);
  };

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
            Ajouter une dépense
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
            htmlFor="expense-amount"
            className="block text-sm font-medium text-slate-300"
          >
            Montant dépense TTC (€)
          </label>
          <input
            id="expense-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
        </div>

        <div>
          <label
            htmlFor="expense-description"
            className="block text-sm font-medium text-slate-300"
          >
            Description{" "}
            <span className="text-xs font-normal text-slate-500">
              (facultatif)
            </span>
          </label>
          <input
            id="expense-description"
            type="text"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Abonnement, logiciel, matériel…"
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
        </div>

        {/* VAT block — opt-in, mirrors the income dialog so the UX
            stays consistent. The amber tone reuses the existing expense
            colour grammar. */}
        <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
          <label
            htmlFor="expense-vat-enabled"
            className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"
          >
            <input
              id="expense-vat-enabled"
              type="checkbox"
              checked={vatEnabled}
              onChange={(e) => setVatEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-white/20 bg-white/5 text-amber-500 accent-amber-500 focus:ring-2 focus:ring-amber-500/40"
            />
            <span>
              <span className="font-medium text-slate-100">
                TVA récupérable
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Si tu récupères la TVA, seule la partie HT est comptée
                comme dépense réelle.
              </span>
            </span>
          </label>

          {vatEnabled && (
            <div className="space-y-3 pl-7">
              <div>
                <span className="block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  Taux de TVA
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VAT_PRESETS.map((preset) => {
                    const active = Math.abs(vatRate - preset.value) < 1e-6;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setVatRate(preset.value)}
                        aria-pressed={active}
                        className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                          active
                            ? "bg-amber-500/15 text-amber-200 ring-amber-500/40"
                            : "bg-white/[0.04] text-slate-300 ring-white/10 hover:bg-white/10 hover:text-slate-100"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {vatPreview && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-slate-900/40 px-3 py-2.5 text-xs ring-1 ring-white/5">
                  <dt className="text-slate-500">Dépense HT</dt>
                  <dd className="text-right font-mono tabular-nums text-amber-200">
                    {formatEuroPreview(vatPreview.ht)}
                  </dd>
                  <dt className="text-slate-500">TVA récupérable estimée</dt>
                  <dd className="text-right font-mono tabular-nums text-slate-300">
                    {formatEuroPreview(vatPreview.vat)}
                  </dd>
                </dl>
              )}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="expense-date"
            className="block text-sm font-medium text-slate-300"
          >
            Date
          </label>
          <input
            id="expense-date"
            type="date"
            required
            value={date}
            max={todayLocalIso()}
            onChange={(e) => handleDateChange(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 shadow-sm focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30 [color-scheme:dark]"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Date de la dépense. Vous pouvez sélectionner une date passée.
          </p>
        </div>

        {dateOutsidePeriod && (
          <div
            role="alert"
            className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2.5 text-sm text-amber-100"
          >
            <p className="font-medium">
              Cette dépense ne tombe pas dans la période que tu consultes.
            </p>
            <p className="text-xs text-amber-200/80">
              {viewedPeriodLabel
                ? `Tu regardes ${viewedPeriodLabel.toLowerCase()}, mais la date choisie est le ${formatLongDate(date)}. Elle sera enregistrée dans la période URSSAF correspondant à cette date.`
                : `La date choisie (${formatLongDate(date)}) ne correspond pas à la période actuellement affichée. Elle sera enregistrée dans la période URSSAF correspondant à cette date.`}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3">
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
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition disabled:cursor-not-allowed disabled:opacity-60 ${
              dateOutsidePeriod && confirmingOutsidePeriod
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-amber-500 hover:bg-amber-400"
            }`}
          >
            {submitting
              ? "Enregistrement…"
              : dateOutsidePeriod && confirmingOutsidePeriod
                ? "Confirmer quand même"
                : "Enregistrer la dépense"}
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
 * Converts a "YYYY-MM-DD" local-date string to an ISO timestamp anchored
 * at 12:00 UTC to dodge timezone edge cases that would push the row into
 * the previous / next day for users far from UTC.
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

function formatEuroPreview(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * See `add-transaction-dialog.tsx` for the contract — duplicated here to
 * keep each dialog a self-contained client component the parent can
 * lazy-load independently.
 */
function isDateOutsidePeriod(
  ymd: string,
  range: { start: string; end?: string } | undefined,
): boolean {
  if (!range) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return false;
  const [, y, m, d] = match;
  const ts = Date.UTC(Number(y), Number(m) - 1, Number(d), 12);
  const startMs = new Date(range.start).getTime();
  if (ts < startMs) return true;
  if (range.end !== undefined) {
    const endMs = new Date(range.end).getTime();
    if (ts >= endMs) return true;
  }
  return false;
}

function formatLongDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
