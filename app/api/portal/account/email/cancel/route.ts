import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export async function POST() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  await prisma.emailChangeRequest.deleteMany({
    where: { clientAccountId: account.id, consumedAt: null },
  });

  return NextResponse.json({ ok: true });
}
