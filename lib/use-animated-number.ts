"use client";

/**
 * useAnimatedNumber — smoothly animate a number from its previous value to
 * its new value over `duration` ms. No external library: a single
 * requestAnimationFrame loop with a configurable easing curve.
 *
 * Used for the hero KPI and breakdown tile count-up effects when
 * SafeWithdraw recomputes after a transaction insert. Keeps the dashboard
 * feeling reactive without the "snap" of an instant React re-render on a
 * money number.
 *
 * - Initial mount: returns the input value immediately (no animation from 0,
 *   which would otherwise look like a load-in flash).
 * - On change: animates from the previously-displayed value to the new one.
 * - On unmount: cancels the active frame.
 * - On `prefers-reduced-motion: reduce`: returns the target value directly.
 *
 * Easing notes:
 *   - `easeOutCubic` is the default — fast start, smooth landing. Great
 *     for secondary numbers (breakdown tiles, history rows) where the
 *     animation should support, not dominate.
 *   - `easeOutExpo` has a much longer deceleration tail. The number
 *     appears to "settle" onto its final value rather than coasting in.
 *     Best reserved for the dominant hero KPI, where the user is actively
 *     watching the digits change.
 */

import { useEffect, useRef, useState } from "react";

export type EasingFn = (t: number) => number;

/** Cubic ease-out — quick start, smooth tail. */
export const easeOutCubic: EasingFn = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Exponential ease-out — very fast initial movement, long graceful tail.
 * The Revolut / Stripe / Apple Wallet "balance settling" curve. The number
 * appears to land on its final value rather than slide into it.
 *
 * Caller must pass a stable reference (this constant is module-level) so
 * the effect's dependency array stays well-behaved.
 */
export const easeOutExpo: EasingFn = (t) =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

export function useAnimatedNumber(
  value: number,
  duration = 600,
  easing: EasingFn = easeOutCubic,
): number {
  // `display` starts at `value` so the initial mount renders the correct
  // number with zero work — no animation from 0, no need to ever setState
  // on first mount.
  const [display, setDisplay] = useState(value);
  const previousRef = useRef(value);
  const initialMount = useRef(true);

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      previousRef.current = value;
      return;
    }

    const start = previousRef.current;
    const end = value;
    if (start === end) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Reduced motion: snap to target on the next frame. Using rAF (instead
    // of a sync setState) keeps the lint rule against in-effect setState
    // happy without sacrificing the accessibility intent.
    if (reducedMotion) {
      const raf = requestAnimationFrame(() => {
        previousRef.current = end;
        setDisplay(end);
      });
      return () => cancelAnimationFrame(raf);
    }

    const startTime = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easing(t);
      const current = start + (end - start) * eased;
      setDisplay(current);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        previousRef.current = end;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, easing]);

  return display;
}
