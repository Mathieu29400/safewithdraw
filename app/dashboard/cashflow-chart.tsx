"use client";

/**
 * CashflowChart — the dashboard's main fintech chart.
 *
 * Stripe-style minimal area chart of the safe-withdrawal balance over time.
 * Single primary line. No grid, no companion series, no legend — just the
 * curve, soft gradient, and a clean tooltip on hover.
 *
 * Scoping: the chart follows the dashboard's view toggle.
 *   - "Période actuelle" → parent passes `period = { start: periodStart }`
 *     and the series is filtered to the current URSSAF period only.
 *   - "All-time"         → parent omits `period` and the chart spans the
 *     full user history.
 *
 * Data source: `useSafeWithdrawSeries`, which delegates the math to
 * `computeSafeWithdrawSeries` in the engine. NO formula lives here — the
 * chart is purely a viewport on the engine's output.
 */

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PeriodRange } from "@/lib/use-safe-withdraw";
import { useSafeWithdrawSeries } from "@/lib/use-safe-withdraw-series";

type Props = {
  userId: string | null;
  advancedMode?: boolean;
  /**
   * Optional period range. When set, the chart shows only data inside it.
   * Pass `undefined` for the all-time view.
   */
  period?: PeriodRange;
  /**
   * When `true`, the empty state copy is tailored to a freshly reset
   * period ("aucune transaction sur cette période") instead of the
   * generic "pas assez d'historique" message used for all-time.
   */
  emptyVariant?: "all-time" | "current-period";
};

export function CashflowChart({
  userId,
  advancedMode,
  period,
  emptyVariant = "all-time",
}: Props) {
  const state = useSafeWithdrawSeries(userId, { advancedMode, period });

  if (state.status === "loading" || state.status === "no-urssaf-profile") {
    return <ChartSkeleton />;
  }

  if (state.status === "error") {
    return (
      <ChartShell>
        <p className="px-6 py-12 text-center text-sm text-rose-300">
          Impossible de charger le graphique : {state.error}
        </p>
      </ChartShell>
    );
  }

  if (state.points.length < 2) {
    return <ChartEmpty variant={emptyVariant} />;
  }

  return <ChartView points={state.points} />;
}

function ChartEmpty({ variant }: { variant: "all-time" | "current-period" }) {
  const title =
    variant === "current-period"
      ? "Aucune transaction sur cette période"
      : "Pas encore d’historique suffisant";
  const subtitle =
    variant === "current-period"
      ? "Ajoutez votre premier chiffre d’affaires depuis le début de cette période URSSAF pour voir le graphique apparaître."
      : "Ajoutez au moins deux transactions sur des dates différentes pour voir l’évolution de votre montant retirable.";
  return (
    <ChartShell>
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>
      </div>
    </ChartShell>
  );
}

function ChartView({
  points,
}: {
  points: ReadonlyArray<{ date: string; safe: number; ca: number }>;
}) {
  // Pull the latest snapshot to colour the gradient based on current state.
  const latest = points[points.length - 1];
  const isOverdrawn = latest.safe < 0;

  const data = useMemo(
    () =>
      points.map((p) => ({
        date: p.date,
        safe: p.safe,
      })),
    [points],
  );

  // Slightly brighter on dark canvas — these read crisper than the deeper
  // emerald/rose tokens used elsewhere.
  const safeColor = isOverdrawn ? "#fb7185" : "#34d399";

  return (
    <ChartShell>
      <div className="relative px-6 pt-6 sm:px-8 sm:pt-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">
          Évolution
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Montant retirable au fil du temps
        </p>
      </div>

      <div className="h-64 w-full px-2 pb-4 pt-6 sm:h-72 sm:px-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <defs>
              {/* Richer fill on dark canvas: higher top alpha so the curve
                  reads as a luminous canyon under the line. Three stops
                  for non-linear falloff (premium gradient). */}
              <linearGradient id="safeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={safeColor} stopOpacity={0.55} />
                <stop offset="55%" stopColor={safeColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={safeColor} stopOpacity={0} />
              </linearGradient>
              {/* Halo behind the stroke — stronger blur on dark for a
                  visible "neon" feel like a banking app graph. */}
              <filter id="safeStrokeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              tick={{ fill: "#475569", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
              padding={{ left: 8, right: 8 }}
            />

            <YAxis
              tickFormatter={formatYAxisTick}
              tick={{ fill: "#475569", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickCount={4}
            />

            <Tooltip
              cursor={{ stroke: "#334155", strokeDasharray: "3 3" }}
              content={<TooltipCard />}
            />

            <Area
              type="monotone"
              dataKey="safe"
              stroke={safeColor}
              strokeWidth={3}
              fill="url(#safeGradient)"
              filter="url(#safeStrokeGlow)"
              dot={false}
              activeDot={{
                r: 5,
                fill: safeColor,
                strokeWidth: 2,
                stroke: "#0f172a",
              }}
              animationDuration={1400}
              animationEasing="ease-out"
              isAnimationActive
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  );
}

function ChartShell({ children }: { children: React.ReactNode }) {
  // Translucent slate panel + ring-white/10 + backdrop-blur ⇒ glassmorphism
  // on the dark page bg. The page's emerald spotlight bleeds through the
  // blur to give the chart a subtle living tint.
  return (
    <div className="card-soft card-interactive relative overflow-hidden rounded-2xl bg-slate-900/50 ring-1 ring-white/10 backdrop-blur-xl">
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <ChartShell>
      <div className="px-6 pt-6 sm:px-8 sm:pt-7">
        <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-3 w-48 animate-pulse rounded bg-white/10" />
      </div>
      <div className="h-64 px-6 pb-6 pt-6 sm:h-72">
        <div className="h-full w-full animate-pulse rounded-xl bg-gradient-to-b from-white/5 to-transparent" />
      </div>
    </ChartShell>
  );
}

type TooltipPayloadEntry = { dataKey: string; value: number };
type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
};

function TooltipCard({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const safeEntry = payload.find((p) => p.dataKey === "safe");
  if (safeEntry === undefined) return null;
  return (
    <div className="rounded-xl bg-slate-950/90 px-3 py-2 text-xs shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">
        {label ? formatDateTooltip(label) : ""}
      </p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
        {formatEuro(safeEntry.value)}
      </p>
    </div>
  );
}

function formatDateTick(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatDateTooltip(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatYAxisTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k €`;
  return `${Math.round(v)} €`;
}

function formatEuro(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}
