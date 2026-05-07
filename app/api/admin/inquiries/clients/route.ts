import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { hydrateAvatarUrls } from "@/lib/storage";

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

  const clients = await prisma.clientAccount.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      avatarPath: true,
      tickets: {
        where: { isInquiry: true, inquiryEndedAt: null },
        select: {
          id: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              body: true,
              senderType: true,
              createdAt: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  // Fetch unread (CLIENT, readAt null) counts per active inquiry in one query.
  const inquiryIds = clients.flatMap((c) => c.tickets.map((t) => t.id));
  const unreadGroups = inquiryIds.length
    ? await prisma.message.groupBy({
        by: ["ticketId"],
        where: {
          ticketId: { in: inquiryIds },
          senderType: "CLIENT",
          readAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const unreadByTicketId = new Map(
    unreadGroups.map((g) => [g.ticketId, g._count._all]),
  );

  const avatarUrls = await hydrateAvatarUrls(clients.map((c) => c.avatarPath));

  return NextResponse.json({
    clients: clients.map((c, i) => {
      const ticket = c.tickets[0];
      const lastMsg = ticket?.messages[0] ?? null;
      const unreadCount = ticket ? unreadByTicketId.get(ticket.id) ?? 0 : 0;
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        avatarUrl: avatarUrls[i],
        hasActiveInquiry: Boolean(ticket),
        ticketId: ticket?.id ?? null,
        unreadCount,
        latestMessage: lastMsg
          ? {
              body: lastMsg.body,
              senderType: lastMsg.senderType,
              at: lastMsg.createdAt.toISOString(),
            }
          : null,
      };
    }),
  });
}
