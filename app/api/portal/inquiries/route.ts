import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { hydrateAttachments } from "@/lib/storage";
import { createNotionTicketPage } from "@/lib/notion";

export async function POST() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (account.sites.length === 0) {
    return NextResponse.json(
      { error: "No site on file. Contact support." },
      { status: 400 },
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
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

  return NextResponse.json({ ticketId: ticket.id, messages });
}
