// lib/availability.ts
// Pure availability computation. No I/O, no React. Importable from server,
// client, and test scripts.

export type AvailabilityState = "online" | "available" | "offline" | "ooo";

export interface DayHours {
  enabled: boolean;
  open?: string;
  close?: string;
}

export type WeeklyHours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", DayHours>;

export interface AdminSettingsInput {
  timezone: string;
  hours: WeeklyHours;
  oooEnabled: boolean;
  oooFrom: Date | null;
  oooUntil: Date | null;
  oooMessage: string | null;
  holidays: string[]; // YYYY-MM-DD list, in `timezone`
}

export interface Availability {
  state: AvailabilityState;
  label: string;
  detail: string;
  nextOpenAt: string | null; // ISO; null when "online"/"available", when "ooo" has no oooUntil, or when no future open exists
}

export function computeAvailability(
  settings: AdminSettingsInput,
  adminOnline: boolean,
  now: Date,
): Availability {
  // 1. OOO check — active when toggle is on AND now is inside the optional window
  const oooActive =
    settings.oooEnabled &&
    (!settings.oooFrom || now >= settings.oooFrom) &&
    (!settings.oooUntil || now < settings.oooUntil);

  if (oooActive) {
    const detail =
      settings.oooMessage?.trim() ||
      (settings.oooUntil
        ? `Out of office until ${settings.oooUntil.toISOString().slice(0, 10)}`
        : "Out of office.");
    return {
      state: "ooo",
      label: "Out of office",
      detail,
      nextOpenAt: settings.oooUntil ? settings.oooUntil.toISOString() : null,
    };
  }

  // 2. Online (live presence)
  if (adminOnline) {
    return {
      state: "online",
      label: "Online",
      detail: "usually replies in minutes",
      nextOpenAt: null,
    };
  }

  // 3. Within hours?
  if (isWithinHours(settings, now)) {
    return {
      state: "available",
      label: "Available",
      detail: "usually replies within the hour",
      nextOpenAt: null,
    };
  }

  // 4. Offline — find next open
  const nextOpenAt = findNextOpen(settings, now);
  return {
    state: "offline",
    label: "Offline",
    detail: nextOpenAt
      ? `back ${formatBackAt(nextOpenAt, settings.timezone)}`
      : "currently unavailable",
    nextOpenAt: nextOpenAt ? nextOpenAt.toISOString() : null,
  };
}

// timezone-aware via Intl.DateTimeFormat parts (no extra deps)

interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; weekday: number; // 0=Sun..6=Sat
}

function getZonedParts(now: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday],
  };
}

function parseHHmm(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function isWithinHours(settings: AdminSettingsInput, now: Date): boolean {
  const z = getZonedParts(now, settings.timezone);
  const ymd = `${z.year.toString().padStart(4, "0")}-${z.month
    .toString()
    .padStart(2, "0")}-${z.day.toString().padStart(2, "0")}`;
  if (settings.holidays.includes(ymd)) return false;

  const day = settings.hours[String(z.weekday) as keyof WeeklyHours];
  if (!day?.enabled || !day.open || !day.close) return false;
  const open = parseHHmm(day.open);
  const close = parseHHmm(day.close);
  if (!open || !close) return false;
  const cur = z.hour * 60 + z.minute;
  return cur >= open.h * 60 + open.m && cur < close.h * 60 + close.m;
}

/**
 * Returns true when `now` is outside the admin's scheduled business hours
 * in the configured timezone. Holidays count as after-hours. OOO does NOT
 * count as after-hours — OOO is for short absences (appointments) where
 * filing should still be a normal ticket.
 */
export function isAfterHours(settings: AdminSettingsInput, now: Date): boolean {
  return !isWithinHours(settings, now);
}

function findNextOpen(settings: AdminSettingsInput, now: Date): Date | null {
  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    const z = getZonedParts(probe, settings.timezone);
    const ymd = `${z.year.toString().padStart(4, "0")}-${z.month
      .toString()
      .padStart(2, "0")}-${z.day.toString().padStart(2, "0")}`;
    if (settings.holidays.includes(ymd)) continue;
    const day = settings.hours[String(z.weekday) as keyof WeeklyHours];
    if (!day?.enabled || !day.open) continue;
    const open = parseHHmm(day.open);
    if (!open) continue;
    const candidate = utcInstantForLocal(z.year, z.month, z.day, open.h, open.m, settings.timezone);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}

function utcInstantForLocal(
  year: number, month: number, day: number,
  hour: number, minute: number, tz: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 2; i++) {
    const z = getZonedParts(guess, tz);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
    const drift = desired - got;
    if (drift === 0) break;
    guess = new Date(guess.getTime() + drift);
  }
  return guess;
}

function formatBackAt(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit",
  }).format(instant);
}
