export const FREE_UPDATE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FreeWindowStatus =
  | { state: "not_in_production" }
  | { state: "active"; daysRemaining: number; expiresAt: Date }
  | { state: "expired"; daysSinceExpired: number; expiredAt: Date };

export function freeWindowStatus(
  productionStartedAt: Date | null | undefined,
  now: Date = new Date(),
): FreeWindowStatus {
  if (!productionStartedAt) return { state: "not_in_production" };
  const expiresAt = new Date(productionStartedAt.getTime() + FREE_UPDATE_DAYS * DAY_MS);
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs > 0) {
    return {
      state: "active",
      daysRemaining: Math.ceil(diffMs / DAY_MS),
      expiresAt,
    };
  }
  return {
    state: "expired",
    daysSinceExpired: Math.floor(-diffMs / DAY_MS),
    expiredAt: expiresAt,
  };
}

export function isOutOfFreeWindow(
  ticketCreatedAt: Date,
  productionStartedAt: Date | null | undefined,
): boolean {
  if (!productionStartedAt) return false;
  const expiresAt = productionStartedAt.getTime() + FREE_UPDATE_DAYS * DAY_MS;
  return ticketCreatedAt.getTime() > expiresAt;
}
