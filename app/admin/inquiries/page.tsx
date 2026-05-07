import Link from "next/link";
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
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <InquiriesLiveRefresh />

      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">Quick Chat</span>
      </div>

      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Inquiries
      </h1>
      <p className="font-display italic text-ink-mute mb-8">
        Lightweight quick-chat threads. Promote one to a tracked ticket, or end the chat to archive it.
      </p>

      <div className="flex items-center gap-6 mb-6 border-b border-rule">
        <Link
          href="/admin/inquiries"
          className={`font-mono text-[0.65rem] uppercase tracking-widest pb-2 transition-colors ${
            !showArchived
              ? "text-ink border-b-2 border-signal-red"
              : "text-ink-mute hover:text-ink"
          }`}
        >
          Active ({activeCount})
        </Link>
        <Link
          href="/admin/inquiries?tab=archived"
          className={`font-mono text-[0.65rem] uppercase tracking-widest pb-2 transition-colors ${
            showArchived
              ? "text-ink border-b-2 border-signal-red"
              : "text-ink-mute hover:text-ink"
          }`}
        >
          Archived ({archivedCount})
        </Link>
      </div>

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
