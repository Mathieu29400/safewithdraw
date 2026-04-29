"use client";

/**
 * AnimatedCurrency — reusable Revolut-style animated financial value.
 *
 * When `value` changes the number counts up (or down) over `duration` ms
 * using an exponential ease-out curve — giving the "balance settling"
 * feel of premium banking apps. At the same time the text color
 * transitions between `positiveColor` and `negativeColor` over the same
 * duration so that both animations are always in sync.
 *
 * Props:
 *   value          – the amount to display (can be negative)
 *   className      – Tailwind classes for size, weight, tracking, etc.
 *                    `tabular-nums` is added automatically.
 *   positiveColor  – Tailwind text-color class used when value ≥ 0
 *                    (default: "text-emerald-50")
 *   negativeColor  – Tailwind text-color class used when value < 0
 *                    (default: "text-rose-100")
 *   duration       – animation duration in ms (default: 700)
 *
 * Formatting:
 *   French locale — "1 500,00 €", "-300,00 €"
 *
 * Accessibility:
 *   The element carries `aria-label` with the plain formatted value so
 *   screen-readers announce the final amount rather than intermediate
 *   fractional digits produced by the animation.
 *
 * Notes on color transitions:
 *   CSS cannot interpolate `background-image`, so `bg-clip-text` gradient
 *   text does NOT transition smoothly. We use a direct `color` property so
 *   that `transition-colors` actually fires. The chosen defaults (emerald-50
 *   / rose-100) are both near-white and remain high-contrast on dark cards.
 *
 * prefers-reduced-motion:
 *   Detected inside `useAnimatedNumber`. The displayed value snaps to the
 *   target on the next frame instead of counting through intermediate values.
 *   The color transition is still applied (single-frame) for clarity.
 */

import { easeOutExpo, useAnimatedNumber } from "@/lib/use-animated-number";

type Props = {
  value: number;
  className?: string;
  positiveColor?: string;
  negativeColor?: string;
  duration?: number;
};

const FORMATTER = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function AnimatedCurrency({
  value,
  className = "",
  positiveColor = "text-emerald-50",
  negativeColor = "text-rose-100",
  duration = 700,
}: Props) {
  const animated = useAnimatedNumber(value, duration, easeOutExpo);

  // `isNegative` is derived from the *target* value, not the animated
  // intermediate, so the color commits to its new state as soon as React
  // receives the new prop — the transition then carries it there smoothly.
  const isNegative = value < 0;
  const colorClass = isNegative ? negativeColor : positiveColor;

  const formatted = FORMATTER.format(animated);
  // aria-label carries the stable final value so screen-readers don't
  // announce fractional intermediate digits.
  const ariaLabel = FORMATTER.format(value);

  return (
    <span
      aria-label={ariaLabel}
      className={`tabular-nums transition-colors ${colorClass} ${className}`}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {formatted}
    </span>
  );
}
