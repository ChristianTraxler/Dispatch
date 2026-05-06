import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const count = await prisma.message.count({
    where: {
      senderType: "CLIENT",
      readAt: null,
      ticket: {
        isInquiry: true,
        inquiryEndedAt: null,
      },
    },
  });

  return NextResponse.json({ count });
}
