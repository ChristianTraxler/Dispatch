// Minimal admin ticket queue. Phase 8 replaces this with the Live Ledger,
// but admins need a way to find tickets right now to test status transitions.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ticketNumber } from "@/lib/ticket";
import { StatusPill } from "@/components/StatusPill";

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
  const tickets = await prisma.ticket.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { displayName: true, url: true } },
      clientAccount: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Ticket Queue
        </span>
      </div>

      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Tickets
      </h1>
      <p className="font-display italic text-ink-mute mb-10">
        Every dispatch filed, newest first. The Live Ledger replaces this view
        in Phase 8.
      </p>

      {tickets.length === 0 ? (
        <p className="font-display italic text-ink-mute">
          No tickets on file yet.
        </p>
      ) : (
        <div className="rule-thin pt-4">
          <ul className="divide-y divide-rule-soft">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/ticket/${t.id}`}
                  className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <StatusPill status={t.status} />
                        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                          {ticketNumber(t.id, t.createdAt)}
                        </span>
                      </div>
                      <p className="font-display text-lg text-ink truncate">
                        {t.title}
                      </p>
                      <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mt-1">
                        {t.clientAccount.name} · {t.site.displayName}
                      </p>
                    </div>
                    <div className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-fade md:text-right shrink-0 mt-2 md:mt-0">
                      Filed {formatRelative(t.createdAt)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
