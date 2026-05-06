import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { endInquiry } from "@/lib/inquiry";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;

  const ticket = await prisma.ticket.findFirst({
    where: { id, clientAccountId: account.id, isInquiry: true },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await endInquiry({ ticketId: id, endedBy: "client", appUrl });

  return NextResponse.json({ ok: true, alreadyEnded: result.alreadyEnded });
}
