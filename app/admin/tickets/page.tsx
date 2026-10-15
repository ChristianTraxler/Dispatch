// Admin ticket queue.

import { prisma } from "@/lib/prisma";
import { ticketNumber } from "@/lib/ticket";
import { formatFiledAt } from "@/lib/datetime";
import { StatusPill } from "@/components/StatusPill";
import { adminHasActivity } from "@/lib/ticket-activity";
import { OutOfFreeWindowBadge } from "@/components/AdminClientDetail";
import { isOutOfFreeWindow } from "@/lib/free-updates";
import { RefreshTicketsOnChange } from "./refresh-on-change";
import { DeleteTicketButton } from "./delete-ticket-button";
import { PageHead, TicketStub, groupByMonth } from "../docket-ui";

function formatRelative(value: Date): string {
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return value.toLocaleString("en-US", { month: "short", day: "2-digit" });
}

export default async function AdminTicketsPage() {
  // Stamps are formatted server-side, so they need the admin's own zone,
  // otherwise they render in the deploy region's clock (UTC).
  const settingsRow = await prisma.adminSettings.findUnique({
    where: { id: "global" },
    select: { timezone: true },
  });
  const tz = settingsRow?.timezone ?? "America/New_York";

  const tickets = await prisma.ticket.findMany({
    where: { isInquiry: false },
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { displayName: true, url: true, productionStartedAt: true } },
      clientAccount: { select: { name: true, email: true } },
    },
  });

  // Unread client messages per ticket, in one grouped query.
  const unreadRows = await prisma.message.groupBy({
    by: ["ticketId"],
    where: { senderType: "CLIENT", readAt: null, ticket: { isInquiry: false } },
    _count: { _all: true },
  });
  const unreadByTicket = new Map(
    unreadRows.map((r) => [r.ticketId, r._count._all]),
  );

  const groups = groupByMonth(tickets, (t) => t.createdAt, tz);

  return (
    <div>
      <RefreshTicketsOnChange />
      <PageHead
        eyebrow="Ticket Queue"
        title="Tickets"
        sub="Every dispatch filed, newest first."
      />

      {tickets.length === 0 ? (
        <div className="dk-emptyslip">
          <p>No tickets on file yet.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="dk-group">
            <div className="dk-ghead">
              <h2>{g.label}</h2>
              <span>{g.items.length} filed</span>
            </div>
            <div className="dk-stubs">
              {g.items.map((t) => {
                const number = ticketNumber(t.id, t.createdAt);
                const unread = unreadByTicket.get(t.id) ?? 0;
                const updated =
                  unread === 0 &&
                  adminHasActivity({
                    unreadCount: unread,
                    adminLastViewedAt: t.adminLastViewedAt,
                    firstViewedAt: t.firstViewedAt,
                    reopenedAt: t.reopenedAt,
                    confirmedAt: t.confirmedAt,
                  });
                return (
                  <TicketStub
                    key={t.id}
                    href={`/admin/ticket/${t.id}`}
                    date={t.createdAt}
                    timeZone={tz}
                    top={
                      <>
                        <StatusPill status={t.status} />
                        {unread > 0 && <span className="dk-flag dk-flag-hot">{unread} new</span>}
                        {updated && <span className="dk-flag">Updated</span>}
                        <span className="dk-id dk-mono">{number}</span>
                        {isOutOfFreeWindow(t.createdAt, t.site.productionStartedAt) && (
                          <OutOfFreeWindowBadge />
                        )}
                      </>
                    }
                    title={t.title}
                    by={
                      <>
                        {t.clientAccount.name} <em>&middot;</em> {t.site.displayName}
                      </>
                    }
                    when={
                      <>
                        <b>Filed {formatRelative(t.createdAt)}</b>
                        <br />
                        <time dateTime={t.createdAt.toISOString()}>
                          {formatFiledAt(t.createdAt, tz)}
                        </time>
                      </>
                    }
                    trash={<DeleteTicketButton id={t.id} label={number} />}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
