import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id: ticketId } = await context.params;

  let payload: { body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = payload.body?.trim();
  if (!body) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      ticketId,
      senderType: "ADMIN",
      senderId: adminUser.id,
      body,
    },
  });

  return NextResponse.json({
    message: {
      id: message.id,
      senderType: message.senderType,
      senderName: "Christian",
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() ?? null,
    },
  });
}
