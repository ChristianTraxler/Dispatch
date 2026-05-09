import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { todayInTimezone, formatYmd, parseYmd } from "@/lib/vacation-helpers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function dateToYmd(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const settings = await prisma.adminSettings.findUnique({ where: { id: "global" } });
  const tz = settings?.timezone ?? "America/New_York";
  const today = todayInTimezone(tz);

  // Return only upcoming + active. Past vacations get cleaned by the cron;
  // any that survive a cron outage are filtered out here so the UI never
  // shows them.
  const rows = await prisma.vacation.findMany({
    where: { endDate: { gte: new Date(`${today}T00:00:00Z`) } },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      label: r.label,
      startDate: dateToYmd(r.startDate),
      endDate: dateToYmd(r.endDate),
    })),
  );
}

interface PostBody {
  label?: string | null;
  startDate?: string;
  endDate?: string;
}

async function broadcastSettingsChanged() {
  // Mirrors the pattern in app/api/admin/settings/route.ts. Best-effort.
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
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  let body: PostBody;
  try { body = (await req.json()) as PostBody; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const startStr = typeof body.startDate === "string" ? body.startDate : "";
  const endStr = typeof body.endDate === "string" ? body.endDate : "";
  const start = parseYmd(startStr);
  const end = parseYmd(endStr);
  if (!start || !end) {
    return NextResponse.json({ error: "startDate and endDate must be YYYY-MM-DD." }, { status: 400 });
  }
  if (startStr > endStr) {
    return NextResponse.json({ error: "startDate must be on or before endDate." }, { status: 400 });
  }

  if (body.label !== undefined && body.label !== null && typeof body.label !== "string") {
    return NextResponse.json({ error: "Invalid label." }, { status: 400 });
  }
  const label =
    body.label === undefined || body.label === null
      ? null
      : (body.label.trim().slice(0, 80) || null);

  const settings = await prisma.adminSettings.findUnique({ where: { id: "global" } });
  const tz = settings?.timezone ?? "America/New_York";
  const today = todayInTimezone(tz);

  if (endStr < today) {
    return NextResponse.json({ error: "endDate must be today or later." }, { status: 400 });
  }

  // Overlap check: existing vacation overlaps if existing.startDate <= new.endDate
  // AND existing.endDate >= new.startDate.
  const overlapping = await prisma.vacation.findFirst({
    where: {
      AND: [
        { startDate: { lte: new Date(`${endStr}T00:00:00Z`) } },
        { endDate:   { gte: new Date(`${startStr}T00:00:00Z`) } },
      ],
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: "Overlaps an existing vacation." },
      { status: 400 },
    );
  }

  const isActiveNow = startStr <= today && today <= endStr;
  const flipNeeded = isActiveNow && settings?.outOfTown !== true;

  const created = await prisma.$transaction(async (tx) => {
    const v = await tx.vacation.create({
      data: {
        label,
        startDate: new Date(`${startStr}T00:00:00Z`),
        endDate: new Date(`${endStr}T00:00:00Z`),
      },
    });
    if (flipNeeded) {
      await tx.adminSettings.upsert({
        where: { id: "global" },
        update: { outOfTown: true },
        create: {
          id: "global",
          timezone: "America/New_York",
          hours: {},
          outOfTown: true,
        },
      });
    }
    return v;
  });

  if (flipNeeded) {
    await broadcastSettingsChanged();
  }

  return NextResponse.json({
    id: created.id,
    label: created.label,
    startDate: dateToYmd(created.startDate),
    endDate: dateToYmd(created.endDate),
  });
}
