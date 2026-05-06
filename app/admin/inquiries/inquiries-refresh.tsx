"use client";

import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

export function InquiriesLiveRefresh() {
  useRealtimeRefresh({ table: "tickets" });
  return null;
}
