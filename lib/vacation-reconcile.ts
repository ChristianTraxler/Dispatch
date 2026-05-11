import "server-only";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayInTimezone } from "@/lib/vacation-helpers";

export interface VacationReconcileResult {
  /** YYYY-MM-DD in admin TZ. */
  today: string;
  /** Vacations whose end day was before today; deleted by this call. */
  ended: Array<{ id: string; startDate: Date; endDate: Date; label: string | null }>;
  /** Vacations whose range includes today. */
  active: Array<{ id: string; startDate: Date; endDate: Date; label: string | null }>;
  /** outOfTown after reconciliation. */
  outOfTownNow: boolean;
  /** True if reconciliation changed `outOfTown` (caller may broadcast). */
  flipped: boolean;
}

/**
 * Brings `AdminSettings.outOfTown` and the `vacations` table into a consistent
 * state given the current admin-local date. Safe to call from any read path
 * (page load, availability API). Idempotent.
 *
 * Rules:
 * - Delete vacations whose `endDate < today` (admin TZ).
 * - If any active vacation includes today AND `outOfTown=false` → flip ON.
 * - If no active vacation AND at least one vacation just ended AND
 *   `outOfTown=true` → flip OFF.
 * - A manually-set `outOfTown=true` with no vacations is left alone.
 *
 * The "flip off" rule requires `ended.length > 0` so manual on-states without
 * any associated vacation are not auto-cleared.
 */
export async function reconcileVacationFlip(): Promise<VacationReconcileResult> {
  const settings = await prisma.adminSettings.findUnique({ where: { id: "global" } });
  const tz = settings?.timezone ?? "America/New_York";
  const today = todayInTimezone(tz);
  const todayUtc = new Date(`${today}T00:00:00Z`);

  const ended = await prisma.vacation.findMany({
    where: { endDate: { lt: todayUtc } },
  });
  if (ended.length > 0) {
    await prisma.vacation.deleteMany({
      where: { id: { in: ended.map((v) => v.id) } },
    });
  }

  const active = await prisma.vacation.findMany({
    where: {
      AND: [
        { startDate: { lte: todayUtc } },
        { endDate: { gte: todayUtc } },
      ],
    },
    orderBy: { endDate: "desc" },
  });

  let outOfTownNow = settings?.outOfTown ?? false;
  let flipped = false;

  if (active.length > 0 && settings?.outOfTown !== true) {
    await prisma.adminSettings.upsert({
      where: { id: "global" },
      update: { outOfTown: true },
      create: {
        id: "global",
        timezone: "America/New_York",
        hours: {},
        outOfTown: true,
      },
    });
    outOfTownNow = true;
    flipped = true;
  } else if (active.length === 0 && ended.length > 0 && settings?.outOfTown === true) {
    await prisma.adminSettings.update({
      where: { id: "global" },
      data: { outOfTown: false },
    });
    outOfTownNow = false;
    flipped = true;
  }

  return {
    today,
    ended: ended.map((v) => ({ id: v.id, startDate: v.startDate, endDate: v.endDate, label: v.label })),
    active: active.map((v) => ({ id: v.id, startDate: v.startDate, endDate: v.endDate, label: v.label })),
    outOfTownNow,
    flipped,
  };
}

/**
 * Best-effort broadcast on the `admin-status` channel. Mirrors the pattern
 * in /api/admin/settings/route.ts. Resolves after 2s even if subscribe stalls.
 */
export async function broadcastSettingsChanged(): Promise<void> {
  try {
    const supabase = supabaseAdmin();
    const ch = supabase.channel("admin-status");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2000);
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          await ch.send({
            type: "broadcast",
            event: "settings-changed",
            payload: { at: Date.now() },
          });
          resolve();
        }
      });
    });
    void supabase.removeChannel(ch);
  } catch {
    // Polling will catch up within 60s.
  }
}
