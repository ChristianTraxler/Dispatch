"use client";

import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

/**
 * Headless component on the Live Ledger that refreshes the page whenever
 * a ticket changes (new submission, status transition). Keeps the stat
 * strip + recent dispatches list current without a manual refresh.
 */
export function LedgerLiveRefresh() {
  useRealtimeRefresh({ table: "tickets" });
  return null;
}
