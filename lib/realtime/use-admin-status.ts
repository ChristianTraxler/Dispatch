"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  computeAvailability,
  type Availability,
  type AdminSettingsInput,
  type WeeklyHours,
} from "@/lib/availability";
import { useAdminPresence } from "./use-presence";

interface ApiResponse {
  state: Availability["state"];
  label: string;
  detail: string;
  nextOpenAt: string | null;
  settings: {
    timezone: string;
    hours: WeeklyHours;
    oooEnabled: boolean;
    oooFrom: string | null;
    oooUntil: string | null;
    oooMessage: string | null;
  };
}

/**
 * Subscribes to admin availability and recomputes locally on:
 *   - presence flips (admin online/offline)
 *   - admin-status broadcast (settings saved)
 *   - 60s tick (so the day-window crossing updates)
 *   - tab visibilitychange (so a tab that slept catches up immediately)
 */
export function useAdminStatus(): Availability | null {
  const [settings, setSettings] = useState<AdminSettingsInput | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const adminOnline = useAdminPresence();

  // Initial fetch + broadcast subscription
  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const refetch = async () => {
      try {
        const res = await fetch("/api/availability", { cache: "no-store" });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as ApiResponse;
        setSettings({
          timezone: data.settings.timezone,
          hours: data.settings.hours,
          oooEnabled: data.settings.oooEnabled,
          oooFrom: data.settings.oooFrom ? new Date(data.settings.oooFrom) : null,
          oooUntil: data.settings.oooUntil ? new Date(data.settings.oooUntil) : null,
          oooMessage: data.settings.oooMessage,
        });
      } catch {
        // ignore; will retry on tick
      }
    };

    void refetch();

    const channel = supabase
      .channel("admin-status")
      .on("broadcast", { event: "settings-changed" }, () => {
        void refetch();
      })
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        void refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, []);

  // 60s tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!settings) return null;
  return computeAvailability(settings, adminOnline, now);
}
