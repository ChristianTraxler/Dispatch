import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const clients = await prisma.clientAccount.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      tickets: {
        where: { isInquiry: true, inquiryEndedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      hasActiveInquiry: c.tickets.length > 0,
    })),
  });
}
