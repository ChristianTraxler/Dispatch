import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;

  const result = await prisma.ticket.updateMany({
    where: {
      id,
      clientAccountId: account.id,
      isInquiry: true,
    },
    data: {
      isInquiry: false,
      inquiryEndedAt: null,
      receivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Inquiry not found or already promoted." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
