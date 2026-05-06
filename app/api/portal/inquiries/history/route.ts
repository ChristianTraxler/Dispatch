import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export async function GET() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const items = await prisma.ticket.findMany({
    where: {
      clientAccountId: account.id,
      isInquiry: true,
      inquiryEndedAt: { not: null },
    },
    orderBy: { inquiryEndedAt: "desc" },
    take: 20,
    select: {
      id: true,
      inquiryEndedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    items: items.map((t) => ({
      id: t.id,
      endedAt: t.inquiryEndedAt!.toISOString(),
      messageCount: t._count.messages,
    })),
  });
}
