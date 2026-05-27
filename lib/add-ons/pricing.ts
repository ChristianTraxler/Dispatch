import type { AddOn, AddOnClientPrice, AddOnPriceType } from "@prisma/client";

export type PriceShape = {
  type: AddOnPriceType;
  cents: number;
  maxCents: number | null;
  percentBp: number | null;
};

export type ResolvedPrice = {
  /** Standard catalog shape. */
  standard: PriceShape;
  /** Effective shape (override-aware). */
  effective: PriceShape;
  /** True if any field differs from the standard catalog price. */
  isOverridden: boolean;

  // Legacy convenience fields (still used by older callers that only handle
  // FIXED + RANGE prices). For PERCENTAGE add-ons, `cents`/`maxCents` are not
  // meaningful — callers must branch on `effective.type` first.
  standardCents: number;
  standardMaxCents: number | null;
  effectiveCents: number;
  effectiveMaxCents: number | null;
};

function shapeFromAddOn(
  addOn: Pick<AddOn, "priceType" | "priceCents" | "priceMaxCents" | "pricePercentBp">,
): PriceShape {
  return {
    type: addOn.priceType,
    cents: addOn.priceCents,
    maxCents: addOn.priceMaxCents ?? null,
    percentBp: addOn.pricePercentBp ?? null,
  };
}

function shapeFromOverride(
  o: Pick<AddOnClientPrice, "priceType" | "priceCents" | "priceMaxCents" | "pricePercentBp">,
): PriceShape {
  return {
    type: o.priceType,
    cents: o.priceCents,
    maxCents: o.priceMaxCents ?? null,
    percentBp: o.pricePercentBp ?? null,
  };
}

function shapesDiffer(a: PriceShape, b: PriceShape): boolean {
  return a.type !== b.type || a.cents !== b.cents || a.maxCents !== b.maxCents || a.percentBp !== b.percentBp;
}

export function resolvePrice(
  addOn: Pick<AddOn, "priceType" | "priceCents" | "priceMaxCents" | "pricePercentBp">,
  override: Pick<AddOnClientPrice, "priceType" | "priceCents" | "priceMaxCents" | "pricePercentBp"> | null | undefined,
): ResolvedPrice {
  const standard = shapeFromAddOn(addOn);
  let effective = standard;
  let isOverridden = false;
  if (override) {
    const o = shapeFromOverride(override);
    if (shapesDiffer(o, standard)) {
      effective = o;
      isOverridden = true;
    }
  }
  return {
    standard,
    effective,
    isOverridden,
    standardCents: standard.cents,
    standardMaxCents: standard.maxCents,
    effectiveCents: effective.cents,
    effectiveMaxCents: effective.maxCents,
  };
}
