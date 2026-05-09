"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
    holidays: string[];
  };
  emergencyAvailable: boolean;
  emergencyFeeCents: number;
}

interface EmergencyState {
  available: boolean;
  feeCents: number;
}

interface AdminStatusValue {
  availability: Availability;
  settings: AdminSettingsInput;
  emergency: EmergencyState;
}

const AdminStatusContext = createContext<AdminStatusValue | null>(null);

/**
 * Single source of truth for admin availability on the client. Subscribes once
 * per provider and fans the result out via context, so multiple consumers
 * (header BusinessHoursPill + chat AdminAvailabilityLine) can read it without
 * each opening their own Supabase channel — Supabase Realtime rejects multiple
 * subscribes on the same channel name.
 *
 * Recomputes locally on:
 *   - presence flips (admin online/offline)
 *   - admin-status broadcast (settings saved)
 *   - 60s tick (so the day-window crossing updates)
 *   - tab visibilitychange (so a tab that slept catches up immediately)
 */
export function AdminStatusProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AdminSettingsInput | null>(null);
  const [emergency, setEmergency] = useState<EmergencyState | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const adminOnline = useAdminPresence();

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
          holidays: data.settings.holidays,
        });
        setEmergency({
          available: data.emergencyAvailable,
          feeCents: data.emergencyFeeCents,
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

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const value: AdminStatusValue | null = settings && emergency
    ? { availability: computeAvailability(settings, adminOnline, now), settings, emergency }
    : null;

  return (
    <AdminStatusContext.Provider value={value}>
      {children}
    </AdminStatusContext.Provider>
  );
}

/** Computed availability state. Null while the initial fetch is in flight. */
export function useAdminStatus(): Availability | null {
  return useContext(AdminStatusContext)?.availability ?? null;
}

/** Raw settings (timezone, hours, OOO, holidays). Null while loading. */
export function useAdminSettings(): AdminSettingsInput | null {
  return useContext(AdminStatusContext)?.settings ?? null;
}

/**
 * Coalesced emergency state: whether the emergency-fix path is currently
 * offered to the client and the fee that would apply. Null while loading.
 * Refetches in real time on the `settings-changed` broadcast — flipping the
 * admin "Out of town" toggle (or any settings change) updates connected
 * portals without a manual refresh.
 */
export function useEmergencyState(): EmergencyState | null {
  return useContext(AdminStatusContext)?.emergency ?? null;
}
