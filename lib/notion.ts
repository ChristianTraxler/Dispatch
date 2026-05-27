import "server-only";
import { Client } from "@notionhq/client";
import { prisma } from "@/lib/prisma";
import type { TicketStatus } from "@prisma/client";
import { ticketNumber } from "@/lib/ticket";

let cachedClient: Client | null = null;
let warnedMissing = false;

function getClient(): Client | null {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!token || !dbId) {
    if (!warnedMissing) {
      console.warn(
        "[notion] NOTION_TOKEN or NOTION_DATABASE_ID not set; Notion sync disabled.",
      );
      warnedMissing = true;
    }
    return null;
  }
  if (!cachedClient) cachedClient = new Client({ auth: token });
  return cachedClient;
}

export interface CreateNotionTicketArgs {
  ticket: {
    id: string;
    createdAt: Date;
    title: string;
    category: string;
    status: TicketStatus;
    isEmergency: boolean;
  };
  account: { name: string; email: string };
  site: { displayName: string };
  appUrl: string;
}

export async function createNotionTicketPage(
  args: CreateNotionTicketArgs,
): Promise<void> {
  const notion = getClient();
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!notion || !dbId) return;

  try {
    const num = ticketNumber(args.ticket.id, args.ticket.createdAt);
    const page = await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        "Ticket #": {
          title: [{ text: { content: num } }],
        },
        Status: { select: { name: args.ticket.status } },
        Category: { select: { name: args.ticket.category } },
        Site: {
          rich_text: [{ text: { content: args.site.displayName } }],
        },
        Client: {
          rich_text: [{ text: { content: args.account.name } }],
        },
        "Client email": { email: args.account.email },
        Emergency: { checkbox: args.ticket.isEmergency },
        Created: { date: { start: args.ticket.createdAt.toISOString() } },
        "Dispatch link": {
          url: `${args.appUrl}/admin/ticket/${args.ticket.id}`,
        },
      },
    });

    await prisma.ticket.update({
      where: { id: args.ticket.id },
      data: { notionPageId: page.id },
    });
  } catch (err) {
    console.error("[notion] create failed:", err);
  }
}

export async function updateNotionTicketStatus(args: {
  ticketId: string;
  status: TicketStatus;
}): Promise<void> {
  const notion = getClient();
  if (!notion) return;

  try {
    const row = await prisma.ticket.findUnique({
      where: { id: args.ticketId },
      select: { notionPageId: true },
    });
    if (!row?.notionPageId) return;

    await notion.pages.update({
      page_id: row.notionPageId,
      properties: {
        Status: { select: { name: args.status } },
      },
    });
  } catch (err) {
    console.error("[notion] update failed:", err);
  }
}
