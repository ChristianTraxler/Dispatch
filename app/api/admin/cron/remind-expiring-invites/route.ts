import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendInviteReminderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_START_HOURS = 36;
const WINDOW_END_HOURS = 60;

export async function POST(req: Request) {
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

  const now = Date.now();
  const windowStart = new Date(now + WINDOW_START_HOURS * HOUR_MS);
  const windowEnd = new Date(now + WINDOW_END_HOURS * HOUR_MS);

  const candidates = await prisma.invite.findMany({
    where: {
      redeemedAt: null,
      revokedAt: null,
      reminderSentAt: null,
      expiresAt: { gte: windowStart, lte: windowEnd },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const sent: string[] = [];

  for (const inv of candidates) {
    const inviteUrl = `${appUrl}/invite/${inv.token}`;
    try {
      await sendInviteReminderEmail({
        recipientName: inv.recipientName ?? undefined,
        email: inv.email,
        siteDisplayName: inv.siteDisplayName,
        inviteUrl,
        expiresAt: inv.expiresAt,
      });
      await prisma.invite.update({
        where: { id: inv.id },
        data: { reminderSentAt: new Date() },
      });
      sent.push(inv.id);
    } catch (err) {
      console.error(`[cron] reminder for ${inv.id} failed:`, err);
    }
  }

  return NextResponse.json({ scanned: candidates.length, sent });
}

export const GET = POST;
