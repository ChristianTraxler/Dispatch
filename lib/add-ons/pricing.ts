import type { AddOn, AddOnClientPrice } from "@prisma/client";

export type ResolvedPrice = {
  /** Standard catalog floor price in cents. */
  standardCents: number;
  /** Standard catalog ceiling in cents (null if not a range). */
  standardMaxCents: number | null;
  /** Effective floor price for this client (override if any). */
  effectiveCents: number;
  /** Effective ceiling for this client (null if not a range). */
  effectiveMaxCents: number | null;
  /** True if any field differs from the standard catalog price. */
  isOverridden: boolean;
};

function rangesDiffer(
  a: { min: number; max: number | null },
  b: { min: number; max: number | null },
): boolean {
  return a.min !== b.min || a.max !== b.max;
}

export function resolvePrice(
  addOn: Pick<AddOn, "priceCents" | "priceMaxCents">,
  override: Pick<AddOnClientPrice, "priceCents" | "priceMaxCents"> | null | undefined,
): ResolvedPrice {
  const standard = { min: addOn.priceCents, max: addOn.priceMaxCents ?? null };
  if (
    override &&
    rangesDiffer(
      { min: override.priceCents, max: override.priceMaxCents ?? null },
      standard,
    )
  ) {
    return {
      standardCents: standard.min,
      standardMaxCents: standard.max,
      effectiveCents: override.priceCents,
      effectiveMaxCents: override.priceMaxCents ?? null,
      isOverridden: true,
    };
  }
  return {
    standardCents: standard.min,
    standardMaxCents: standard.max,
    effectiveCents: standard.min,
    effectiveMaxCents: standard.max,
    isOverridden: false,
  };
}
