import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeAvailability,
  isAfterHours,
  type AdminSettingsInput,
  type WeeklyHours,
} from "@/lib/availability";
import { formatYmd } from "@/lib/vacation-helpers";
import {
  reconcileVacationFlip,
  broadcastSettingsChanged,
} from "@/lib/vacation-reconcile";

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

function ymdFromDate(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function dayAfterYmd(d: Date): string {
  const next = new Date(d.getTime() + 86_400_000);
  return ymdFromDate(next);
}

export async function GET() {
  // Reconcile first so the displayed state matches reality even if the daily
  // cron missed a tick. Catches "vacation starts today" without waiting for
  // 05:05 UTC; also auto-cleans expired vacations and flips the flag off.
  const recon = await reconcileVacationFlip();
  if (recon.flipped) {
    // Best-effort: broadcast so other open tabs (admin page, chat widget)
    // refetch immediately. If this fails, the 60s tick + visibility refetch
    // still catches up.
    await broadcastSettingsChanged();
  }

  const row = await prisma.adminSettings.findUnique({ where: { id: "global" } });

  // Use the freshest active vacation list from the reconcile result. The
  // "longest-ending" active vacation drives the return date so back-to-back
  // vacations chain correctly.
  const activeReturnDate = recon.active.length
    ? dayAfterYmd(
        recon.active.reduce((max, v) => (v.endDate > max ? v.endDate : max), recon.active[0].endDate),
      )
    : null;

  // outOfTown is effectively true when either the persisted flag is on OR
  // a vacation is currently active. Belt + suspenders against any drift
  // between the flag and the vacation table.
  const effectiveOutOfTown = (row?.outOfTown ?? false) || recon.active.length > 0;

  const settings: AdminSettingsInput = {
    timezone: row?.timezone ?? "America/New_York",
    hours: (row?.hours as WeeklyHours | undefined) ?? DEFAULT_HOURS,
    oooEnabled: row?.oooEnabled ?? false,
    oooFrom: row?.oooFrom ?? null,
    oooUntil: row?.oooUntil ?? null,
    oooMessage: row?.oooMessage ?? null,
    outOfTown: effectiveOutOfTown,
    outOfTownUntil: effectiveOutOfTown ? activeReturnDate : null,
    holidays: row?.holidays ?? [],
  };

  const now = new Date();
  // Note: live admin presence is *not* known to the server here. Clients
  // recompute locally when presence flips. We default to false so a stale
  // GET reads as "available or offline depending on schedule" — never a
  // false "online".
  const availability = computeAvailability(settings, false, now);
  const afterHours = isAfterHours(settings, now);
  const emergencyAvailable = afterHours && !effectiveOutOfTown;
  const emergencyFeeCents = row?.emergencyFeeCents ?? 5000;

  return NextResponse.json(
    {
      ...availability,
      settings: serializeSettings(settings),
      emergencyAvailable,
      emergencyFeeCents,
    },
    {
      // No shared caching: clients refetch this on the "settings-changed"
      // broadcast and need fresh data immediately. A 30s CDN cache made
      // OOO toggles invisible on the client portal until the cache expired.
      headers: { "Cache-Control": "no-store" },
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
    outOfTown: s.outOfTown,
    outOfTownUntil: s.outOfTownUntil,
    holidays: s.holidays,
  };
}
