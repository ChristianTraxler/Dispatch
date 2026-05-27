import type { AddOnPriceUnit, AddOnScope } from "@prisma/client";
import type { PriceShape } from "./pricing";

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

export function priceUnitSuffix(unit: AddOnPriceUnit): string {
  switch (unit) {
    case "PER_MONTH":
      return "/mo";
    case "PER_YEAR":
      return "/yr";
    case "ONE_TIME":
      return " one-time";
    case "ON_TOTAL_BUILD":
      return " on total build";
  }
}

/**
 * Human-readable label for a price unit (defaults rendered when no custom
 * label is set). Used as the right-side badge beside the price.
 */
export function defaultUnitLabel(unit: AddOnPriceUnit): string {
  switch (unit) {
    case "PER_MONTH":
      return "Per month";
    case "PER_YEAR":
      return "Per year";
    case "ONE_TIME":
      return "One-time";
    case "ON_TOTAL_BUILD":
      return "On total build";
  }
}

/** Pick the display label: custom override if present (and non-empty), else default. */
export function resolveUnitLabel(unit: AddOnPriceUnit, customLabel: string | null | undefined): string {
  if (customLabel && customLabel.trim()) return customLabel.trim();
  return defaultUnitLabel(unit);
}

export function scopeLabel(scope: AddOnScope): string {
  return scope === "PER_SITE" ? "per site" : "for your account";
}

/**
 * Render a price (or price range) without the per-period suffix.
 * Pass `maxCents=null` for a single-price add-on; pass a value for a range.
 */
export function formatPriceRange(minCents: number, maxCents: number | null): string {
  if (maxCents === null || maxCents === minCents) return formatCents(minCents);
  return `${formatCents(minCents)} – ${formatCents(maxCents)}`;
}

/** Render a percentage from basis points (2500 → "+25%", -500 → "-5%"). */
export function formatPercentBp(bp: number): string {
  const pct = bp / 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
  // strip trailing .0 / .00
  const text = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${sign}${text}%`;
}

/**
 * Render any price shape into a display string without unit suffix.
 * FIXED → "$X", RANGE → "$X – $Y", PERCENTAGE → "+25%".
 */
export function formatPriceShape(shape: PriceShape): string {
  switch (shape.type) {
    case "FIXED":
      return formatCents(shape.cents);
    case "RANGE":
      return formatPriceRange(shape.cents, shape.maxCents);
    case "PERCENTAGE":
      return shape.percentBp === null ? "—" : formatPercentBp(shape.percentBp);
  }
}

/**
 * Append the per-period suffix only when meaningful. Percentage add-ons render
 * the unit (e.g. "+25% one-time"), but it usually reads more naturally without.
 */
export function priceShapeSuffix(shape: PriceShape, unit: AddOnPriceUnit): string {
  if (shape.type === "PERCENTAGE") return priceUnitSuffix(unit);
  return priceUnitSuffix(unit);
}
