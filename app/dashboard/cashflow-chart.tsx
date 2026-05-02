"use client";

/**
 * CashflowChart — the dashboard's main fintech chart.
 *
 * Stripe-style minimal area chart of the safe-withdrawal balance over time.
 * When the chart is scoped to the CURRENT period (isCurrentPeriod = true), a
 * second dashed series is appended showing the projected safe balance through
 * to the end of the URSSAF period. The projection is visually secondary:
 * dashed stroke, no fill area, labelled "Projection (estimation)" in the
 * tooltip.
 *
 * Projection data logic:
 *   - Take the last actual data point's CA and safe balance.
 *   - Compute `caPerDay = lastCA / elapsedDays` where `elapsedDays` is days
 *     from period start to the last data point.
 *   - For each future day up to period end:
 *       proj = lastSafe + caPerDay × daysFromLast × netRate
 *     where `netRate = 1 - urssafRate - SECURITY_RESERVE_RATE`.
 *   - The first projection point is placed AT the last actual point so the
 *     two curves join seamlessly.
 *
 * The projection is suppressed when:
 *   - CA is 0 (no pace to extrapolate)
 *   - Less than 1 day has elapsed since period start
 *   - The period is already finished (no future days left)
 *   - `isCurrentPeriod` is false or `periodType` is not provided
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

import { SECURITY_RESERVE_RATE } from "@/lib/cashflow";
import type { PeriodType } from "@/lib/database.types";
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
  /**
   * When true AND `periodType` is provided, a dashed projection series is
   * rendered from the last actual data point to the end of the URSSAF
   * period.
   */
  isCurrentPeriod?: boolean;
  /** Required for the projection end-date computation (monthly vs quarterly). */
  periodType?: PeriodType;
};

export function CashflowChart({
  userId,
  advancedMode,
  period,
  emptyVariant = "all-time",
  isCurrentPeriod,
  periodType,
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

  const showProjection =
    isCurrentPeriod === true && periodType !== undefined && period !== undefined;

  return (
    <ChartView
      points={state.points}
      urssafRate={state.urssafRate}
      period={showProjection ? period : undefined}
      periodType={showProjection ? periodType : undefined}
    />
  );
}

function ChartEmpty({ variant }: { variant: "all-time" | "current-period" }) {
  const title =
    variant === "current-period"
      ? "Aucune transaction sur cette période"
      : "Pas encore d'historique suffisant";
  const subtitle =
    variant === "current-period"
      ? "Ajoutez votre premier chiffre d'affaires depuis le début de cette période URSSAF pour voir le graphique apparaître."
      : "Ajoutez au moins deux transactions sur des dates différentes pour voir l'évolution de votre montant retirable.";
  return (
    <ChartShell>
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>
      </div>
    </ChartShell>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CashflowPoint = { date: string; ts: number; ca: number; safe: number };

function periodEndUTC(start: string, type: PeriodType): Date {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return type === "quarterly"
    ? new Date(Date.UTC(y, m + 3, 1))
    : new Date(Date.UTC(y, m + 1, 1));
}

/** Returns "YYYY-MM-DD" for a UTC date. */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ChartRow = {
  date: string;
  safe: number | null;
  proj: number | null;
};

function buildProjectionRows(
  points: CashflowPoint[],
  period: PeriodRange,
  periodType: PeriodType,
  urssafRate: number,
): ChartRow[] | null {
  const last = points[points.length - 1];
  const periodStartMs = new Date(period.start).getTime();
  const periodEndMs = periodEndUTC(period.start, periodType).getTime();

  const elapsedDays = (last.ts - periodStartMs) / 86_400_000;
  const remainingMs = periodEndMs - last.ts;
  const remainingDays = remainingMs / 86_400_000;

  if (elapsedDays < 1 || remainingDays < 1 || last.ca <= 0) return null;

  const netRate = 1 - urssafRate - SECURITY_RESERVE_RATE;
  const caPerDay = last.ca / elapsedDays;

  // Actual rows — `proj` is null for all but the final (junction) point.
  const rows: ChartRow[] = points.map((p, i) => ({
    date: p.date,
    safe: p.safe,
    proj: i === points.length - 1 ? p.safe : null,
  }));

  // Projection rows — one per day from day+1 to period end (exclusive).
  const lastTs = last.ts;
  let day = 1;
  while (true) {
    const ms = lastTs + day * 86_400_000;
    if (ms >= periodEndMs) break;
    const projDate = toDateKey(new Date(ms));
    const additionalCA = caPerDay * day;
    const projSafe = last.safe + additionalCA * netRate;
    rows.push({ date: projDate, safe: null, proj: projSafe });
    day++;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// ChartView
// ---------------------------------------------------------------------------

function ChartView({
  points,
  urssafRate,
  period,
  periodType,
}: {
  points: ReadonlyArray<CashflowPoint>;
  urssafRate: number;
  period?: PeriodRange;
  periodType?: PeriodType;
}) {
  const latest = points[points.length - 1];
  const isOverdrawn = latest.safe < 0;
  const safeColor = isOverdrawn ? "#fb7185" : "#34d399";

  const chartData = useMemo<ChartRow[]>(() => {
    if (period && periodType) {
      const projected = buildProjectionRows(
        points as CashflowPoint[],
        period,
        periodType,
        urssafRate,
      );
      if (projected) return projected;
    }
    return points.map((p) => ({ date: p.date, safe: p.safe, proj: null }));
  }, [points, period, periodType, urssafRate]);

  const hasProjection = chartData.some((r) => r.proj !== null);

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
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="safeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={safeColor} stopOpacity={0.55} />
                <stop offset="55%" stopColor={safeColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={safeColor} stopOpacity={0} />
              </linearGradient>
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

            {/* Actual historical series */}
            <Area
              type="monotone"
              dataKey="safe"
              stroke={safeColor}
              strokeWidth={3}
              fill="url(#safeGradient)"
              filter="url(#safeStrokeGlow)"
              dot={false}
              activeDot={{ r: 5, fill: safeColor, strokeWidth: 2, stroke: "#0f172a" }}
              connectNulls={false}
              animationDuration={1400}
              animationEasing="ease-out"
              isAnimationActive
            />

            {/* Projection series — dashed, no fill, visually secondary */}
            {hasProjection && (
              <Area
                type="monotone"
                dataKey="proj"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="none"
                dot={false}
                activeDot={{ r: 4, fill: "#64748b", strokeWidth: 1, stroke: "#0f172a" }}
                connectNulls={false}
                animationDuration={1400}
                animationEasing="ease-out"
                isAnimationActive
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {hasProjection && (
        <p className="px-6 pb-5 text-center text-[11px] text-slate-600 sm:px-8">
          Cette projection est une estimation si ton activité reste stable.
        </p>
      )}
    </ChartShell>
  );
}

function ChartShell({ children }: { children: React.ReactNode }) {
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

type TooltipPayloadEntry = { dataKey: string; value: number | null };
type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
};

function TooltipCard({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const safeEntry = payload.find((p) => p.dataKey === "safe" && p.value !== null);
  const projEntry = payload.find((p) => p.dataKey === "proj" && p.value !== null);

  if (!safeEntry && !projEntry) return null;

  return (
    <div className="rounded-xl bg-slate-950/90 px-3 py-2.5 text-xs shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">
        {label ? formatDateTooltip(label) : ""}
      </p>
      {safeEntry && (
        <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
          {formatEuro(safeEntry.value ?? 0)}
        </p>
      )}
      {projEntry && !safeEntry && (
        <>
          <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-400">
            ~{formatEuro(projEntry.value ?? 0)}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-600">
            Projection — estimation
          </p>
        </>
      )}
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
