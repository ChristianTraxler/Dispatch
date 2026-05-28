import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { hydrateAttachments, hydrateAvatarUrl } from "@/lib/storage";
import { createNotionTicketPage } from "@/lib/notion";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  let payload: { clientAccountId?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const clientAccountId = payload.clientAccountId?.trim();
  if (!clientAccountId) {
    return NextResponse.json(
      { error: "clientAccountId is required." },
      { status: 400 },
    );
  }

  const account = await prisma.clientAccount.findUnique({
    where: { id: clientAccountId },
    include: { sites: { orderBy: { addedAt: "asc" }, take: 1 } },
  });
  if (!account || account.sites.length === 0) {
    return NextResponse.json(
      { error: "Client not found or has no site." },
      { status: 404 },
    );
  }

  const existing = await prisma.ticket.findFirst({
    where: {
      clientAccountId: account.id,
      isInquiry: true,
      inquiryEndedAt: null,
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  let ticket = existing;

  if (!ticket) {
    const created = await prisma.ticket.create({
      data: {
        clientAccountId: account.id,
        siteId: account.sites[0].id,
        title: "Quick question",
        description: "(quick chat)",
        category: "QUESTION",
        status: "NEW",
        isInquiry: true,
      },
    });
    ticket = { ...created, messages: [] };
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    after(() =>
      createNotionTicketPage({
        ticket: created,
        account: { name: account.name, email: account.email },
        site: { displayName: account.sites[0].displayName },
        appUrl,
      }),
    );
  }

  const messages = await Promise.all(
    ticket.messages.map(async (m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "ADMIN" ? "Christian" : account.name,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(m.attachments),
    })),
  );

  const clientAvatarUrl = await hydrateAvatarUrl(account.avatarPath);

  return NextResponse.json({
    ticketId: ticket.id,
    messages,
    clientName: account.name,
    clientAvatarUrl,
  });
}
