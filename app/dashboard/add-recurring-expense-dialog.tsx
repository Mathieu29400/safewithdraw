"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { PeriodType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Called after a successful insert. Lets the parent refresh its list. */
  onCreated?: () => void;
  /**
   * The user's URSSAF declaration cadence. Drives the "× 3 sur les
   * trimestres" hint copy so the user understands a 50 € monthly
   * recurring will materialize as 150 € on the next quarterly period.
   */
  declarationFrequency?: PeriodType;
};

const VAT_PRESETS = [
  { label: "20 %", value: 0.2 },
  { label: "10 %", value: 0.1 },
  { label: "5,5 %", value: 0.055 },
] as const;

const DEFAULT_VAT_RATE = 0.2;

type Scope = "include-past" | "from-this-month";

/**
 * Quick-entry modal for recurring (monthly) expense templates.
 *
 * UX contract
 *   * The amount is ALWAYS interpreted as a monthly value, regardless of
 *     the user's declaration frequency. The DB trigger
 *     `materialize_recurring_expenses` multiplies by 3 on quarterly
 *     periods so the materialized expense reflects the full window.
 *   * No date picker: this is a template, not a one-off entry.
 *   * The user picks the SCOPE explicitly:
 *       - "include-past" — apply to this month AND past months that
 *         already have activity. This is the historical-truth flow,
 *         used when adding a recurring expense the user has actually
 *         been paying for a while.
 *       - "from-this-month" — apply only from this month forward. Past
 *         dashboards stay untouched: useful when subscribing to a new
 *         service that didn't exist before. The DB trigger always
 *         fans out across every activity bucket; we trim past rows
 *         post-insert when this scope is picked.
 *   * VAT semantics mirror `AddExpenseDialog`: NULL = HT spend, non-null
 *     = the entered amount is TTC and the engine reduces it to HT.
 */
export function AddRecurringExpenseDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
  declarationFrequency = "monthly",
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);

  // Default = include past so the user's previous dashboards reflect
  // the recurring spend they were already paying for. Switching to
  // "from-this-month" is the explicit "this is a new subscription"
  // affordance.
  const [scope, setScope] = useState<Scope>("include-past");

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

  const isQuarterly = declarationFrequency === "quarterly";
  const quarterlyPreview = useMemo(() => {
    if (!isQuarterly || ttcParsed === null) return null;
    return ttcParsed * 3;
  }, [isQuarterly, ttcParsed]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
      setError("Saisissez un montant supérieur à 0 (ex : 49.99).");
      return;
    }

    setSubmitting(true);
    const trimmedDescription = description.trim();
    const persistedVatRate = vatEnabled ? vatRate : null;
    const { data: inserted, error: insertError } = await supabase
      .from("recurring_expenses")
      .insert({
        user_id: userId,
        amount: parsedAmount,
        description: trimmedDescription === "" ? null : trimmedDescription,
        vat_rate: persistedVatRate,
      })
      .select("id")
      .single();

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    // Scope = "from-this-month" — the trigger has already fanned out
    // across EVERY activity bucket (including past months). Trim the
    // rows strictly before the current calendar month so historical
    // dashboards stay exactly as they were.
    if (scope === "from-this-month" && inserted?.id) {
      const cutoff = startOfCurrentMonthUtc();
      const { error: trimError } = await supabase
        .from("expenses")
        .delete()
        .eq("user_id", userId)
        .eq("recurring_expense_id", inserted.id)
        .lt("created_at", cutoff);
      if (trimError) {
        setSubmitting(false);
        setError(trimError.message);
        return;
      }
    }

    onCreated?.();
    onOpenChange(false);
    setAmount("");
    setDescription("");
    setVatEnabled(false);
    setVatRate(DEFAULT_VAT_RATE);
    setScope("include-past");
    setSubmitting(false);
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
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">
              Nouvelle dépense récurrente
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Indique le montant mensuel et choisis où l’appliquer. Les
              prochaines périodes URSSAF la reprendront automatiquement.
            </p>
          </div>
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
            htmlFor="recurring-amount"
            className="block text-sm font-medium text-slate-300"
          >
            Montant mensuel TTC (€)
          </label>
          <input
            id="recurring-amount"
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
          {isQuarterly && quarterlyPreview !== null && (
            <p className="mt-1.5 text-xs text-amber-300/80">
              Tu déclares au trimestre : la dépense matérialisée sera de{" "}
              <span className="font-mono font-medium">
                {formatEuroPreview(quarterlyPreview)}
              </span>{" "}
              à chaque nouvelle période (× 3).
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="recurring-description"
            className="block text-sm font-medium text-slate-300"
          >
            Description{" "}
            <span className="text-xs font-normal text-slate-500">
              (facultatif)
            </span>
          </label>
          <input
            id="recurring-description"
            type="text"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Loyer, abonnement, comptable…"
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
          <label
            htmlFor="recurring-vat-enabled"
            className="flex cursor-pointer items-start gap-3 text-sm text-slate-200"
          >
            <input
              id="recurring-vat-enabled"
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
                  <dt className="text-slate-500">Dépense HT (mensuelle)</dt>
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

        <fieldset className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
          <legend className="px-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Appliquer à
          </legend>
          <ScopeOption
            id="recurring-scope-include-past"
            label="Ce mois-ci et les mois précédents"
            description="La dépense apparaît aussi sur l’historique des mois passés (s’il y en a)."
            checked={scope === "include-past"}
            onSelect={() => setScope("include-past")}
          />
          <ScopeOption
            id="recurring-scope-from-this-month"
            label="À partir de ce mois-ci"
            description="L’historique reste tel qu’il est. La dépense compte pour ce mois-ci et les périodes à venir."
            checked={scope === "from-this-month"}
            onSelect={() => setScope("from-this-month")}
          />
        </fieldset>

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
            className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </dialog>
  );
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

/** First day of the current calendar month, UTC, as ISO timestamp. */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/**
 * Single radio-style row in the "Appliquer à" fieldset. Built on top
 * of a real `<input type="radio">` so keyboard navigation and form
 * accessibility work for free; the visual styling is layered on with
 * Tailwind. Description copy lives inline so the user reads exactly
 * what each scope does before committing.
 */
function ScopeOption({
  id,
  label,
  description,
  checked,
  onSelect,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
        checked
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-white/5 bg-transparent hover:border-white/15 hover:bg-white/[0.03]"
      }`}
    >
      <input
        id={id}
        name="recurring-scope"
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 cursor-pointer border-white/20 bg-white/5 text-amber-500 accent-amber-500 focus:ring-2 focus:ring-amber-500/40"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-100">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-400">
          {description}
        </span>
      </span>
    </label>
  );
}
