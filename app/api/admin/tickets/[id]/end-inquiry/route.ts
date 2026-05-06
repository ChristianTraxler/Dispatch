import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { endInquiry } from "@/lib/inquiry";

export async function POST(
  req: Request,
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

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, isInquiry: true },
  });
  if (!ticket || !ticket.isInquiry) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await endInquiry({ ticketId: id, endedBy: "admin", appUrl });

  return NextResponse.json({ ok: true, alreadyEnded: result.alreadyEnded });
}
