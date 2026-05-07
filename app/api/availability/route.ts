import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeAvailability,
  type AdminSettingsInput,
  type WeeklyHours,
} from "@/lib/availability";

export const dynamic = "force-dynamic";

const DEFAULT_HOURS: WeeklyHours = {
  "0": { enabled: false },
  "1": { enabled: true, open: "09:00", close: "17:00" },
  "2": { enabled: true, open: "09:00", close: "17:00" },
  "3": { enabled: true, open: "09:00", close: "17:00" },
  "4": { enabled: true, open: "09:00", close: "17:00" },
  "5": { enabled: true, open: "09:00", close: "17:00" },
  "6": { enabled: false },
};

export async function GET() {
  const row = await prisma.adminSettings.findUnique({ where: { id: "global" } });

  // Note: live admin presence is *not* known to the server here. Clients
  // recompute locally when presence flips. We default to false so a stale
  // GET reads as "available or offline depending on schedule" — never a
  // false "online".
  const settings: AdminSettingsInput = {
    timezone: row?.timezone ?? "America/New_York",
    hours: (row?.hours as WeeklyHours | undefined) ?? DEFAULT_HOURS,
    oooEnabled: row?.oooEnabled ?? false,
    oooFrom: row?.oooFrom ?? null,
    oooUntil: row?.oooUntil ?? null,
    oooMessage: row?.oooMessage ?? null,
  };

  const availability = computeAvailability(settings, false, new Date());

  return NextResponse.json(
    { ...availability, settings: serializeSettings(settings) },
    {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    },
  );
}

function serializeSettings(s: AdminSettingsInput) {
  return {
    timezone: s.timezone,
    hours: s.hours,
    oooEnabled: s.oooEnabled,
    oooFrom: s.oooFrom ? s.oooFrom.toISOString() : null,
    oooUntil: s.oooUntil ? s.oooUntil.toISOString() : null,
    oooMessage: s.oooMessage,
  };
}
