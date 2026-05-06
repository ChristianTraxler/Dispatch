import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id } = await context.params;

  const result = await prisma.ticket.updateMany({
    where: { id, isInquiry: true },
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
