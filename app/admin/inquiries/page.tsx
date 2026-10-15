import Link from "next/link";
import { PageHead } from "../docket-ui";
import { prisma } from "@/lib/prisma";
import { hydrateAvatarUrls } from "@/lib/storage";
import { InquiriesLiveRefresh } from "./inquiries-refresh";
import type { InquiryRowData } from "./inquiry-row";
import { InquiriesListClient } from "./inquiries-list-client";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminInquiriesPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const showArchived = tab === "archived";

  const inquiries = await prisma.ticket.findMany({
    where: {
      isInquiry: true,
      ...(showArchived
        ? { inquiryEndedAt: { not: null } }
        : { inquiryEndedAt: null }),
    },
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    include: {
      clientAccount: { select: { name: true, avatarPath: true } },
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, senderType: true },
      },
    },
  });

  const avatarUrls = await hydrateAvatarUrls(
    inquiries.map((t) => t.clientAccount.avatarPath),
  );

  const [activeCount, archivedCount] = await Promise.all([
    prisma.ticket.count({ where: { isInquiry: true, inquiryEndedAt: null } }),
    prisma.ticket.count({ where: { isInquiry: true, inquiryEndedAt: { not: null } } }),
  ]);

  return (
    <div>
      <InquiriesLiveRefresh />

      <PageHead
        eyebrow="Quick Chat"
        title="Inquiries"
        sub="Lightweight quick-chat threads. Promote one to a tracked ticket, or end the chat to archive it."
      />

      <nav className="dk-tabs" aria-label="Inquiry lists">
        <Link
          href="/admin/inquiries"
          aria-current={!showArchived ? "page" : undefined}
        >
          Active <span className="dk-c">({activeCount})</span>
        </Link>
        <Link
          href="/admin/inquiries?tab=archived"
          aria-current={showArchived ? "page" : undefined}
        >
          Archived <span className="dk-c">({archivedCount})</span>
        </Link>
      </nav>

      <InquiriesListClient
        initial={inquiries.map((t, i) => {
          const last = t.messages[0];
          const preview =
            last?.body?.trim().slice(0, 100) ?? "(no messages yet)";
          const lastSenderTag =
            last?.senderType === "CLIENT"
              ? "client"
              : last?.senderType === "ADMIN"
                ? "you"
                : "—";
          const row: InquiryRowData = {
            id: t.id,
            clientName: t.clientAccount.name,
            avatarUrl: avatarUrls[i],
            preview,
            lastSenderTag,
            messageCount: t._count.messages,
            activityIso: (t.lastMessageAt ?? t.createdAt).toISOString(),
          };
          return row;
        })}
        emptyMessage={
          showArchived ? "Nothing archived yet." : "No active inquiries."
        }
      />
    </div>
  );
}
