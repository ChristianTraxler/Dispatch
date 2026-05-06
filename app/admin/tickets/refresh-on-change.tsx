"use client";

import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

/**
 * Headless component — just subscribes to tickets and refreshes the
 * containing server page when anything changes (new ticket, status
 * transition, etc).
 */
export function RefreshTicketsOnChange() {
  useRealtimeRefresh({ table: "tickets" });
  return null;
}
