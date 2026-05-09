import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { id } = await params;

  const settings = await prisma.adminSettings.findUnique({ where: { id: "global" } });
  const tz = settings?.timezone ?? "America/New_York";
  const today = todayInTimezone(tz);

  const target = await prisma.vacation.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ ok: true }); // already gone

  const targetStart = dateToYmd(target.startDate);
  const targetEnd = dateToYmd(target.endDate);
  const targetWasActive = targetStart <= today && today <= targetEnd;

  let flipNeeded = false;
  await prisma.$transaction(async (tx) => {
    await tx.vacation.delete({ where: { id } });

    if (targetWasActive && settings?.outOfTown === true) {
      // Is any OTHER vacation currently active?
      const otherActive = await tx.vacation.findFirst({
        where: {
          AND: [
            { startDate: { lte: new Date(`${today}T00:00:00Z`) } },
            { endDate:   { gte: new Date(`${today}T00:00:00Z`) } },
          ],
        },
      });
      if (!otherActive) {
        await tx.adminSettings.update({
          where: { id: "global" },
          data: { outOfTown: false },
        });
        flipNeeded = true;
      }
    }
  });

  if (flipNeeded) {
    await broadcastSettingsChanged();
  }

  return NextResponse.json({ ok: true });
}
