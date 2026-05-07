"use client";

import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

/**
 * Headless — subscribes to the tickets table and refreshes the
 * containing server page on any change. Mirrors the admin-side
 * RefreshTicketsOnChange so the client dashboard reacts when admin
 * actions (delete, status update, new ticket from another device)
 * change the underlying data.
 */
export function RefreshDashboardOnTicketChange() {
  useRealtimeRefresh({ table: "tickets" });
  return null;
}
