import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWaitingInquiryEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const ONE_HOUR_MS = 60 * 60 * 1000;

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

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL not set." }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - ONE_HOUR_MS);

  const candidates = await prisma.ticket.findMany({
    where: {
      isInquiry: true,
      inquiryEndedAt: null,
      adminNudgedAt: null,
      lastMessageAt: { lt: cutoff, not: null },
    },
    include: {
      clientAccount: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { senderType: true, body: true, createdAt: true },
      },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const sent: string[] = [];
  for (const t of candidates) {
    const last = t.messages[0];
    if (!last || last.senderType !== "CLIENT") continue;

    try {
      await sendWaitingInquiryEmail(adminEmail, {
        clientName: t.clientAccount.name,
        ticketUrl: `${appUrl}/admin/ticket/${t.id}`,
        latestMessageBody: last.body || "(attachment only)",
        latestMessageAt: last.createdAt,
      });
      await prisma.ticket.update({
        where: { id: t.id },
        data: { adminNudgedAt: new Date() },
      });
      sent.push(t.id);
    } catch (err) {
      console.error(`[cron] nudge for ${t.id} failed:`, err);
    }
  }

  return NextResponse.json({ scanned: candidates.length, sent });
}

export const GET = POST;
