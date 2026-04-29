/**
 * URSSAF activity catalog for the micro-entrepreneur regime.
 *
 * Rates are decimal (e.g. 0.256 = 25.60 %) to match the
 * `urssaf_profile.urssaf_rate numeric(5,4)` column.
 *
 * This list is the product source of truth — adjust here only, then
 * re-verify the values match URSSAF's published rates before each release.
 *
 * The onboarding form always exposes a "custom rate" path on top of these
 * presets so users with ACRE, exonerations or unusual situations can
 * override the rate.
 */

export type UrssafActivity = {
  /** Stable id, used as React key and form value. */
  id: string;
  /** Human-readable label, also stored verbatim in `urssaf_profile.activity_type`. */
  name: string;
  /** Short helper line — examples of professions that fit. */
  description: string;
  /** Decimal rate, e.g. 0.256. */
  rate: number;
};

export const URSSAF_ACTIVITIES: ReadonlyArray<UrssafActivity> = [
  {
    id: "commerce",
    name: "Commerce (achat / revente)",
    description:
      "Achat-revente de marchandises, e-commerce, restauration, fourniture de logement.",
    rate: 0.123,
  },
  {
    id: "services-commerciaux-artisanaux",
    name: "Services commerciaux / artisanaux",
    description:
      "Prestations commerciales et artisanales : artisans, dépannage, auto-école, etc.",
    rate: 0.212,
  },
  {
    id: "freelance-prestations",
    name: "Freelance / prestations de services",
    description:
      "Conseil, développement, marketing, design et autres prestations intellectuelles non réglementées.",
    rate: 0.256,
  },
  {
    id: "professions-liberales-cipav",
    name: "Professions libérales (CIPAV)",
    description:
      "Architectes, ingénieurs-conseils, géomètres, et autres professions affiliées à la CIPAV.",
    rate: 0.232,
  },
  {
    id: "location-meublee-tourisme-classee",
    name: "Location meublée de tourisme classée",
    description:
      "Locations classées au sens de l’article L324-1 du Code du tourisme.",
    rate: 0.06,
  },
];

export const CUSTOM_ACTIVITY_ID = "custom";
