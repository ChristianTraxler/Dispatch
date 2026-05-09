import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayInTimezone, formatYmd } from "@/lib/vacation-helpers";

export const dynamic = "force-dynamic";

function dateToYmd(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

async function broadcastSettingsChanged() {
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

export async function POST(req: Request) {
  // Auth via cron secret. Mirror app/api/admin/cron/remind-expiring-invites/route.ts.
  const authHeader = req.headers.get("authorization");
  const customHeader = req.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 500 });
  }
  const ok = authHeader === `Bearer ${secret}` || customHeader === secret;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const settings = await prisma.adminSettings.findUnique({ where: { id: "global" } });
  const tz = settings?.timezone ?? "America/New_York";
  const today = todayInTimezone(tz);
  const todayUtc = new Date(`${today}T00:00:00Z`);

  // Step 1: Cleanup — delete all vacations whose end day has passed.
  const ended = await prisma.vacation.findMany({
    where: { endDate: { lt: todayUtc } },
  });
  if (ended.length > 0) {
    await prisma.vacation.deleteMany({
      where: { id: { in: ended.map((v) => v.id) } },
    });
  }

  // Step 2: Active set — vacations that include today.
  const active = await prisma.vacation.findMany({
    where: {
      AND: [
        { startDate: { lte: todayUtc } },
        { endDate:   { gte: todayUtc } },
      ],
    },
  });

  // Step 3: Decide flip.
  let broadcasted = false;
  let outOfTownNow = settings?.outOfTown ?? false;

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
    await broadcastSettingsChanged();
    broadcasted = true;
  } else if (active.length === 0 && ended.length > 0 && settings?.outOfTown === true) {
    await prisma.adminSettings.update({
      where: { id: "global" },
      data: { outOfTown: false },
    });
    outOfTownNow = false;
    await broadcastSettingsChanged();
    broadcasted = true;
  }

  return NextResponse.json({
    today,
    ended: ended.map((v) => ({
      id: v.id, label: v.label,
      startDate: dateToYmd(v.startDate), endDate: dateToYmd(v.endDate),
    })),
    activeNow: active.map((v) => ({
      id: v.id, label: v.label,
      startDate: dateToYmd(v.startDate), endDate: dateToYmd(v.endDate),
    })),
    outOfTownNow,
    broadcasted,
  });
}
