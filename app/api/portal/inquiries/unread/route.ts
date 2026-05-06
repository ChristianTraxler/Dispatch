import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const count = await prisma.message.count({
    where: {
      senderType: "ADMIN",
      readAt: null,
      ticket: {
        clientAccountId: account.id,
        isInquiry: true,
        inquiryEndedAt: null,
      },
    },
  });

  return NextResponse.json({ count });
}
