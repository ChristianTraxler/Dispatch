import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endInquiry } from "@/lib/inquiry";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const stale = await prisma.ticket.findMany({
    where: {
      isInquiry: true,
      inquiryEndedAt: null,
      OR: [
        { lastMessageAt: { lt: cutoff } },
        { lastMessageAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const results: Array<{ id: string; archived: boolean; error?: string }> = [];
  for (const t of stale) {
    try {
      await endInquiry({ ticketId: t.id, endedBy: "auto", appUrl });
      results.push({ id: t.id, archived: true });
    } catch (err) {
      results.push({
        id: t.id,
        archived: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ scanned: stale.length, results });
}

export const GET = POST;
