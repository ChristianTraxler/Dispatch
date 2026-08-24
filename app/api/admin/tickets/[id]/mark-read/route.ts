import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { notifyTicketViewed } from "@/lib/notify";

// Marks every CLIENT-sent message on this ticket as read by the admin viewer.
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

  const { id: ticketId } = await context.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      category: true,
      createdAt: true,
      firstViewedAt: true,
      clientAccount: { select: { authUserId: true, email: true, name: true } },
      site: { select: { displayName: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const result = await prisma.message.updateMany({
    where: {
      ticketId,
      senderType: "CLIENT",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  // Stage 3 of the timeline. The `firstViewedAt: null` guard makes this
  // write-once — count tells us whether this was genuinely the first view,
  // so re-opening a ticket never re-notifies.
  if (!ticket.firstViewedAt) {
    const firstView = await prisma.ticket.updateMany({
      where: { id: ticketId, firstViewedAt: null },
      data: { firstViewedAt: new Date() },
    });
    if (firstView.count === 1) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      after(() => notifyTicketViewed(ticket, appUrl));
    }
  }

  return NextResponse.json({ updated: result.count });
}
