import { describe, expect, it } from "vitest";

import {
  VAT_DANGER_THRESHOLD_RATIO,
  VAT_THRESHOLDS,
  VAT_WARNING_THRESHOLD_RATIO,
  computeProjectedExceedDate,
  computeVatStatus,
  daysElapsedInYear,
  endOfYearIso,
  getVatCategoryForActivity,
  getVatCategoryForActivityId,
  getVatThresholdForActivity,
  startOfYearIso,
  sumHtRevenue,
  toHt,
} from "./vat";

describe("VAT_THRESHOLDS", () => {
  it("matches the 2026 seuils majorés published by the DGFiP", () => {
    expect(VAT_THRESHOLDS.services).toBe(41_250);
    expect(VAT_THRESHOLDS.goods).toBe(93_500);
  });
});

describe("warning ratios", () => {
  it("warning fires at 70 %, danger at 90 %", () => {
    expect(VAT_WARNING_THRESHOLD_RATIO).toBe(0.7);
    expect(VAT_DANGER_THRESHOLD_RATIO).toBe(0.9);
  });
});

describe("getVatCategoryForActivity", () => {
  it("maps Commerce to goods (93 500 €)", () => {
    expect(getVatCategoryForActivity("Commerce (achat / revente)")).toBe(
      "goods",
    );
  });

  it("maps Freelance / prestations to services (41 250 €)", () => {
    expect(
      getVatCategoryForActivity("Freelance / prestations de services"),
    ).toBe("services");
  });

  it("maps CIPAV to services (41 250 €)", () => {
    expect(getVatCategoryForActivity("Professions libérales (CIPAV)")).toBe(
      "services",
    );
  });

  it("maps location meublée classée to goods (93 500 €)", () => {
    expect(
      getVatCategoryForActivity("Location meublée de tourisme classée"),
    ).toBe("goods");
  });

  it("defaults unknown / custom activities to services (the safer choice)", () => {
    expect(getVatCategoryForActivity("Conseil — ACRE 1ère année")).toBe(
      "services",
    );
    expect(getVatCategoryForActivity("")).toBe("services");
  });
});

describe("getVatCategoryForActivityId", () => {
  it("matches by stable id (UI-level lookup)", () => {
    expect(getVatCategoryForActivityId("commerce")).toBe("goods");
    expect(getVatCategoryForActivityId("freelance-prestations")).toBe(
      "services",
    );
  });

  it("defaults custom id to services", () => {
    expect(getVatCategoryForActivityId("custom")).toBe("services");
  });
});

describe("getVatThresholdForActivity", () => {
  it("returns the right € HT amount for each preset", () => {
    expect(
      getVatThresholdForActivity("Commerce (achat / revente)"),
    ).toBe(93_500);
    expect(
      getVatThresholdForActivity("Freelance / prestations de services"),
    ).toBe(41_250);
  });
});

describe("toHt", () => {
  it("returns amount as-is when vat_rate is null (no VAT invoiced)", () => {
    expect(toHt(1000, null)).toBe(1000);
  });

  it("converts a TTC amount with 20 % VAT to HT", () => {
    expect(toHt(1200, 0.2)).toBeCloseTo(1000, 6);
  });

  it("converts a TTC amount with 10 % VAT (hébergement classé) to HT", () => {
    expect(toHt(1100, 0.1)).toBeCloseTo(1000, 6);
  });

  it("treats vat_rate of 0 the same as null", () => {
    expect(toHt(1000, 0)).toBe(1000);
  });

  it("collapses invalid amounts to 0 (defensive)", () => {
    expect(toHt(Number.NaN, 0.2)).toBe(0);
    expect(toHt(-50, 0.2)).toBe(0);
    expect(toHt(Number.POSITIVE_INFINITY, 0.2)).toBe(0);
  });

  it("falls back to amount when vat_rate is invalid", () => {
    expect(toHt(1200, Number.NaN)).toBe(1200);
    expect(toHt(1200, -0.2)).toBe(1200);
  });
});

describe("sumHtRevenue", () => {
  it("sums a mix of HT and TTC rows correctly", () => {
    const total = sumHtRevenue([
      { amount: 1000, vat_rate: null },
      { amount: 1200, vat_rate: 0.2 },
      { amount: 550, vat_rate: 0.1 },
    ]);
    expect(total).toBeCloseTo(1000 + 1000 + 500, 2);
  });

  it("returns 0 on empty input", () => {
    expect(sumHtRevenue([])).toBe(0);
  });

  it("rounds to 2 decimals to avoid floating-point drift in UI", () => {
    const total = sumHtRevenue([
      { amount: 100.1, vat_rate: 0.2 },
      { amount: 100.1, vat_rate: 0.2 },
      { amount: 100.1, vat_rate: 0.2 },
    ]);
    expect(total.toString()).not.toMatch(/\.\d{3,}$/);
  });
});

describe("startOfYearIso / endOfYearIso", () => {
  it("returns Jan 1st 00:00:00 UTC for the given year", () => {
    expect(startOfYearIso(2026)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns Dec 31st 23:59:59.999 UTC for the given year", () => {
    expect(endOfYearIso(2026)).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("daysElapsedInYear", () => {
  it("clamps to a minimum of 1 day on Jan 1st (avoids /0)", () => {
    const jan1 = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(daysElapsedInYear(jan1)).toBe(1);
  });

  it("returns ~31 days on Feb 1st", () => {
    const feb1 = new Date(Date.UTC(2026, 1, 1, 0, 0, 0));
    expect(daysElapsedInYear(feb1)).toBe(31);
  });

  it("returns ~181 days on July 1st", () => {
    const jul1 = new Date(Date.UTC(2026, 6, 1, 0, 0, 0));
    expect(daysElapsedInYear(jul1)).toBe(181);
  });
});

describe("computeVatStatus", () => {
  const baseInput = {
    threshold: 41_250,
    category: "services" as const,
    isVatRegistered: false,
    now: new Date(Date.UTC(2026, 5, 15, 12, 0, 0)),
  };

  it("returns 'registered' when the user already invoices VAT", () => {
    const status = computeVatStatus({
      ...baseInput,
      revenueYTD: 35_000,
      isVatRegistered: true,
    });
    expect(status.level).toBe("registered");
    expect(status.projectedExceedDate).toBeNull();
  });

  it("returns 'safe' below 70 % of the threshold", () => {
    const status = computeVatStatus({ ...baseInput, revenueYTD: 28_000 });
    expect(status.level).toBe("safe");
  });

  it("returns 'warning' between 70 % and 90 %", () => {
    const status = computeVatStatus({ ...baseInput, revenueYTD: 30_000 });
    expect(status.level).toBe("warning");
  });

  it("returns 'warning' exactly at 70 %", () => {
    const status = computeVatStatus({
      ...baseInput,
      revenueYTD: 41_250 * 0.7,
    });
    expect(status.level).toBe("warning");
  });

  it("returns 'danger' between 90 % and 100 %", () => {
    const status = computeVatStatus({ ...baseInput, revenueYTD: 38_500 });
    expect(status.level).toBe("danger");
  });

  it("returns 'danger' exactly at 90 %", () => {
    const status = computeVatStatus({
      ...baseInput,
      revenueYTD: 41_250 * 0.9,
    });
    expect(status.level).toBe("danger");
  });

  it("returns 'exceeded' at 100 %", () => {
    const status = computeVatStatus({ ...baseInput, revenueYTD: 41_250 });
    expect(status.level).toBe("exceeded");
  });

  it("returns 'exceeded' above 100 % with negative remaining", () => {
    const status = computeVatStatus({ ...baseInput, revenueYTD: 50_000 });
    expect(status.level).toBe("exceeded");
    expect(status.remaining).toBeLessThan(0);
    expect(status.ratio).toBeGreaterThan(1);
    expect(status.ratioClamped).toBe(1);
  });

  it("computes ratio and remaining correctly", () => {
    const status = computeVatStatus({ ...baseInput, revenueYTD: 20_625 });
    expect(status.ratio).toBeCloseTo(0.5, 6);
    expect(status.ratioClamped).toBeCloseTo(0.5, 6);
    expect(status.remaining).toBeCloseTo(20_625, 6);
  });

  it("handles negative / NaN revenue defensively (collapses to 0)", () => {
    const negative = computeVatStatus({ ...baseInput, revenueYTD: -100 });
    expect(negative.revenueYTD).toBe(0);
    expect(negative.level).toBe("safe");

    const nan = computeVatStatus({ ...baseInput, revenueYTD: Number.NaN });
    expect(nan.revenueYTD).toBe(0);
    expect(nan.level).toBe("safe");
  });

  it("works the same on the goods threshold (93 500 €)", () => {
    const status = computeVatStatus({
      revenueYTD: 70_000,
      threshold: 93_500,
      category: "goods",
      isVatRegistered: false,
      now: new Date(Date.UTC(2026, 5, 15, 12, 0, 0)),
    });
    expect(status.category).toBe("goods");
    expect(status.threshold).toBe(93_500);
    expect(status.level).toBe("warning");
  });
});

describe("computeProjectedExceedDate", () => {
  const lateJune = new Date(Date.UTC(2026, 5, 30, 12, 0, 0));

  it("returns null when the user is already VAT-registered", () => {
    expect(
      computeProjectedExceedDate({
        revenueYTD: 20_000,
        threshold: 41_250,
        isVatRegistered: true,
        now: lateJune,
      }),
    ).toBeNull();
  });

  it("returns null when revenue is 0 (nothing to extrapolate)", () => {
    expect(
      computeProjectedExceedDate({
        revenueYTD: 0,
        threshold: 41_250,
        isVatRegistered: false,
        now: lateJune,
      }),
    ).toBeNull();
  });

  it("returns null when the threshold is already exceeded", () => {
    expect(
      computeProjectedExceedDate({
        revenueYTD: 50_000,
        threshold: 41_250,
        isVatRegistered: false,
        now: lateJune,
      }),
    ).toBeNull();
  });

  it("returns null before March (too few days to project reliably)", () => {
    // Feb 15 → only 46 days elapsed, below the 60-day floor.
    const feb15 = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));
    expect(
      computeProjectedExceedDate({
        revenueYTD: 10_000,
        threshold: 41_250,
        isVatRegistered: false,
        now: feb15,
      }),
    ).toBeNull();
  });

  it("returns a plausible future date when projection is meaningful", () => {
    // End of June, 30k earned on a 41 250 € threshold. Daily avg ≈
    // 30 000 / 181 ≈ 165.7 €/day. Remaining ≈ 11 250 €. Days to cross
    // ≈ 68 → projected around early September 2026.
    const projected = computeProjectedExceedDate({
      revenueYTD: 30_000,
      threshold: 41_250,
      isVatRegistered: false,
      now: lateJune,
    });
    expect(projected).not.toBeNull();
    expect(projected!.getUTCFullYear()).toBe(2026);
    expect(projected!.getUTCMonth()).toBeGreaterThanOrEqual(7); // Aug or later
    expect(projected!.getUTCMonth()).toBeLessThanOrEqual(9); // not past Oct
  });

  it("returns null when the projected date falls into next year", () => {
    // Low revenue → daily avg too small → projected date pushed past
    // Dec 31 → we don't lie across years.
    const projected = computeProjectedExceedDate({
      revenueYTD: 20_000,
      threshold: 41_250,
      isVatRegistered: false,
      now: lateJune,
    });
    // With 20k earned by end of June, daily avg is ~110 €/day → it
    // would take ~192 days to add 21250 € more, landing in Jan 2027.
    expect(projected).toBeNull();
  });

  it("returns a plausible date for the goods threshold too", () => {
    const projected = computeProjectedExceedDate({
      revenueYTD: 50_000,
      threshold: 93_500,
      isVatRegistered: false,
      now: lateJune,
    });
    expect(projected).not.toBeNull();
    expect(projected!.getUTCFullYear()).toBe(2026);
  });
});
