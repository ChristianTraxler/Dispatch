import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { hydrateAvatarUrls } from "@/lib/storage";

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
      avatarPath: true,
      tickets: {
        where: { isInquiry: true, inquiryEndedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  const avatarUrls = await hydrateAvatarUrls(clients.map((c) => c.avatarPath));

  return NextResponse.json({
    clients: clients.map((c, i) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      avatarUrl: avatarUrls[i],
      hasActiveInquiry: c.tickets.length > 0,
    })),
  });
}
