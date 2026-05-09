import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { todayInTimezone, formatYmd } from "@/lib/vacation-helpers";

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
