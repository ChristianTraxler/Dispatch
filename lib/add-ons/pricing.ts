import type { AddOn, AddOnClientPrice } from "@prisma/client";

export type ResolvedPrice = {
  standardCents: number;
  effectiveCents: number;
  isOverridden: boolean;
};

export function resolvePrice(
  addOn: Pick<AddOn, "priceCents">,
  override: Pick<AddOnClientPrice, "priceCents"> | null | undefined,
): ResolvedPrice {
  const standardCents = addOn.priceCents;
  if (override && override.priceCents !== addOn.priceCents) {
    return {
      standardCents,
      effectiveCents: override.priceCents,
      isOverridden: true,
    };
  }
  return { standardCents, effectiveCents: standardCents, isOverridden: false };
}
