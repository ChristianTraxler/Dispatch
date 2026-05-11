import "server-only";
import { NextResponse } from "next/server";
import { formatYmd } from "@/lib/vacation-helpers";
import {
  reconcileVacationFlip,
  broadcastSettingsChanged,
} from "@/lib/vacation-reconcile";

export const dynamic = "force-dynamic";

function dateToYmd(d: Date): string {
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
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

  const recon = await reconcileVacationFlip();
  if (recon.flipped) {
    await broadcastSettingsChanged();
  }

  return NextResponse.json({
    today: recon.today,
    ended: recon.ended.map((v) => ({
      id: v.id, label: v.label,
      startDate: dateToYmd(v.startDate), endDate: dateToYmd(v.endDate),
    })),
    activeNow: recon.active.map((v) => ({
      id: v.id, label: v.label,
      startDate: dateToYmd(v.startDate), endDate: dateToYmd(v.endDate),
    })),
    outOfTownNow: recon.outOfTownNow,
    broadcasted: recon.flipped,
  });
}
