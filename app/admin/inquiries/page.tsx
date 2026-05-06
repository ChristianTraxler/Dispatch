import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hydrateAvatarUrls } from "@/lib/storage";
import { Avatar } from "@/components/Avatar";
import { InquiriesLiveRefresh } from "./inquiries-refresh";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

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

      {inquiries.length === 0 ? (
        <p className="font-display italic text-ink-mute">
          {showArchived ? "Nothing archived yet." : "No active inquiries."}
        </p>
      ) : (
        <ul className="divide-y divide-rule-soft">
          {inquiries.map((t, i) => {
            const last = t.messages[0];
            const preview = last?.body?.trim().slice(0, 100) ?? "(no messages yet)";
            const lastSenderTag =
              last?.senderType === "CLIENT" ? "client" : last?.senderType === "ADMIN" ? "you" : "—";
            const activity = t.lastMessageAt ?? t.createdAt;
            return (
              <li key={t.id}>
                <Link
                  href={`/admin/ticket/${t.id}`}
                  className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
                >
                  <div className="flex items-center gap-4">
                    <Avatar
                      src={avatarUrls[i]}
                      name={t.clientAccount.name}
                      size={40}
                      tone="client"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg text-ink">
                        {t.clientAccount.name}
                      </p>
                      <p className="font-display italic text-ink-mute text-sm mt-1 truncate">
                        <span className="font-mono not-italic text-[0.55rem] uppercase tracking-widest text-ink-fade mr-2">
                          {lastSenderTag}:
                        </span>
                        {preview}
                      </p>
                    </div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade text-right shrink-0">
                      {t._count.messages} msg{t._count.messages === 1 ? "" : "s"} · {formatRelative(activity)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
