"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

export type TransactionType = "income" | "withdrawal";

type Props = {
  type: TransactionType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Called after a successful insert. Lets the parent refresh its list. */
  onCreated?: () => void;
  /**
   * Optional `YYYY-MM-DD` pre-fill for the date picker. When omitted, falls
   * back to today's local date. We deliberately default to today even when
   * the user is browsing an archived period — see the comment in the
   * dashboard's `dialogDefaultDate` for the rationale.
   */
  defaultDate?: string;
  /**
   * The URSSAF period the user is currently CONSULTING in the dashboard,
   * if any. Used purely as a safety net: if the entered date falls outside
   * this window, the dialog asks the user to confirm before persisting —
   * because clicking "Ajouter du chiffre d'affaires" while looking at the
   * March archive but submitting with a May date is almost always a slip.
   *
   * Pass `undefined` for the all-time view (no period scoping → no
   * mismatch is ever possible). For the live current period, pass `{start}`
   * with no `end` (the period has no upper bound). For an archived period,
   * pass both bounds.
   */
  viewedPeriodRange?: { start: string; end?: string };
  /**
   * Human-readable label of the viewed period, used in the confirmation
   * banner ("Tu consultes la période [mars 2026]…"). When absent, the
   * banner falls back to a generic "cette période" wording.
   */
  viewedPeriodLabel?: string;
};

/**
 * VAT presets we offer to the user. We deliberately keep the list short to
 * the three rates that cover virtually every micro-entrepreneur invoice in
 * France (standard, intermediate, reduced). The default is 20 % because that
 * is by far the most common.
 *
 * Stored as decimals with 4 decimal precision so 5.5 % is exact (0.0550).
 */
const VAT_PRESETS = [
  { label: "20 %", value: 0.2 },
  { label: "10 %", value: 0.1 },
  { label: "5,5 %", value: 0.055 },
] as const;

const DEFAULT_VAT_RATE = 0.2;

/**
 * Quick-entry modal for transactions. Uses the native <dialog> element
 * so we get focus management, Esc-to-close and a backdrop for free.
 *
 * The user can pick any past date — this is by design, freelancers need to
 * backfill data from before they signed up.
 *
 * Income rows can also be tagged with a VAT (TVA) rate. When the user ticks
 * "J'ai facturé de la TVA", the entered amount is interpreted as TTC and
 * the engine derives HT via `HT = TTC / (1 + rate)`. Withdrawals never
 * accept VAT — the input is only rendered for incomes.
 */
export function AddTransactionDialog({
  type,
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
  const [date, setDate] = useState<string>(() => defaultDate ?? todayLocalIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VAT toggle + rate. Only meaningful for incomes; reset to "off / 20 %"
  // every time the dialog opens so the user starts from a known baseline.
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);

  // Two-step submit guard for period mismatches. Flips to `true` the FIRST
  // time the user submits with a date outside the viewed period; the
  // second click on the (now relabelled) confirm button performs the
  // actual insert. Reset every time the user touches the date input so a
  // correction immediately undoes the warning state.
  const [confirmingOutsidePeriod, setConfirmingOutsidePeriod] = useState(false);

  const isIncome = type === "income";

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

  // Live HT / VAT preview shown under the input. Only computed when VAT
  // is on AND the amount is a valid positive number — otherwise we leave
  // the preview area empty (the helper text still explains what will
  // happen). Memoised so re-renders from the date input don't recompute.
  const ttcParsed = useMemo(() => parseAmount(amount), [amount]);
  const vatPreview = useMemo(() => {
    if (!isIncome || !vatEnabled || ttcParsed === null) return null;
    const ht = ttcParsed / (1 + vatRate);
    return { ht, vat: ttcParsed - ht };
  }, [isIncome, vatEnabled, ttcParsed, vatRate]);

  // Pre-compute whether the currently-typed date falls outside the period
  // the user is consulting. We use this in the JSX to render the warning
  // banner BEFORE the user even submits — so the slip is visible while
  // they're still looking at the form, not just after a click.
  const dateOutsidePeriod = useMemo(
    () => isDateOutsidePeriod(date, viewedPeriodRange),
    [date, viewedPeriodRange],
  );

  // Reset the confirm gate the moment the user touches the date. Without
  // this, fixing the date would still leave the "Confirmer quand même"
  // button label active until the next submit — confusing.
  const handleDateChange = (next: string) => {
    setDate(next);
    setConfirmingOutsidePeriod(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
      setError("Saisissez un montant supérieur à 0 (ex : 1500.00).");
      return;
    }

    // When the user keeps "today" as the date, store the EXACT current
    // timestamp instead of noon UTC. This is critical right after a
    // "Nouvelle période URSSAF" reset: the new period starts at the click
    // moment, and any new transaction the user logs today must land AFTER
    // that moment to be included in the fresh KPI.
    // For past dates, keep the noon-UTC anchor (timezone-safe backfilling).
    const isoDate =
      date === todayLocalIso() ? new Date().toISOString() : parseLocalDateToIso(date);
    if (!isoDate) {
      setError("Date invalide.");
      return;
    }

    // Period-mismatch guard. If the entered date is outside the period the
    // user is consulting AND they haven't acknowledged it yet, swap the
    // submit button into "Confirmer quand même" mode and bail out. The
    // second click (with `confirmingOutsidePeriod` already true) goes
    // through to the actual insert.
    if (dateOutsidePeriod && !confirmingOutsidePeriod) {
      setConfirmingOutsidePeriod(true);
      return;
    }

    setSubmitting(true);
    // Persist `vat_rate` only when the checkbox is on AND the row is an
    // income — the column is nullable and `null` means "no VAT". This
    // keeps existing data semantically identical to the new world.
    const persistedVatRate = isIncome && vatEnabled ? vatRate : null;
    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: userId,
      type,
      amount: parsedAmount,
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

  const title = isIncome ? "Ajouter du chiffre d’affaires" : "Ajouter un retrait";
  const submitLabel = isIncome
    ? "Enregistrer l’entrée"
    : "Enregistrer le retrait";
  const submitClass = isIncome
    ? "bg-emerald-500 hover:bg-emerald-400 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)]"
    : "bg-white/10 hover:bg-white/15 ring-1 ring-white/10";

  // Income rows are TTC by default in the new spec — always TTC labelled,
  // even when the VAT checkbox is off (in which case TTC === HT). Withdrawals
  // keep the simple "Montant" label since VAT does not apply.
  const amountLabel = isIncome ? "Montant encaissé TTC (€)" : "Montant (€)";

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
            {amountLabel}
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

        {/* VAT block — incomes only. The checkbox is muted by default so a
            first-time freelancer who is not VAT-liable doesn't get distracted. */}
        {isIncome && (
          <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
            <label
              htmlFor="vat-enabled"
              className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"
            >
              <input
                id="vat-enabled"
                type="checkbox"
                checked={vatEnabled}
                onChange={(e) => setVatEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-white/20 bg-white/5 text-emerald-500 accent-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
              />
              <span>
                <span className="font-medium text-slate-100">
                  J’ai facturé de la TVA
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Le montant HT est calculé automatiquement.
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
                          className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
                            active
                              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40"
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
                    <dt className="text-slate-500">Montant HT</dt>
                    <dd className="text-right font-mono tabular-nums text-emerald-300">
                      {formatEuroPreview(vatPreview.ht)}
                    </dd>
                    <dt className="text-slate-500">TVA collectée estimée</dt>
                    <dd className="text-right font-mono tabular-nums text-slate-300">
                      {formatEuroPreview(vatPreview.vat)}
                    </dd>
                  </dl>
                )}
              </div>
            )}
          </div>
        )}

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
            onChange={(e) => handleDateChange(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 [color-scheme:dark]"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Vous pouvez saisir une date passée pour rattraper vos données.
          </p>
        </div>

        {/* Period mismatch warning. Rendered ABOVE the buttons so the user
            sees the mismatch as soon as they pick a date outside the
            consulted period — they don't have to click submit first. The
            actual submit blocking happens in handleSubmit; this banner is
            purely the visual cue. */}
        {dateOutsidePeriod && (
          <div
            role="alert"
            className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2.5 text-sm text-amber-100"
          >
            <p className="font-medium">
              Cette {isIncome ? "entrée" : "sortie"} ne tombe pas dans la
              période que tu consultes.
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
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              dateOutsidePeriod && confirmingOutsidePeriod
                ? "bg-amber-500 hover:bg-amber-400 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
                : submitClass
            }`}
          >
            {submitting
              ? "Enregistrement…"
              : dateOutsidePeriod && confirmingOutsidePeriod
                ? "Confirmer quand même"
                : submitLabel}
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

function formatEuroPreview(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Returns true when the entered date falls outside the period the user
 * is consulting. Both bounds matter:
 *   - earlier than `start` (inclusive lower bound) → outside
 *   - on/after `end` when defined (exclusive upper bound) → outside
 *
 * The date is anchored at noon UTC to dodge timezone edge-cases that
 * could push a `YYYY-MM-DD` input over the boundary by a few hours.
 *
 * Returns false when no period is provided (all-time view) or the
 * input is not a valid YYYY-MM-DD string.
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

/** Long-form French date — "7 mai 2026". Used in the period-mismatch banner. */
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
