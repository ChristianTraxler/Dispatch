import type { AddOnPriceUnit, AddOnScope } from "@prisma/client";

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
  }
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
