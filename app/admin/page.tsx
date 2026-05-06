import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ticketNumber } from "@/lib/ticket";
import { StatusPill } from "@/components/StatusPill";
import { LedgerLiveRefresh } from "./ledger-live-refresh";

const OPEN_STATUSES = ["NEW", "REVIEWING", "FIXING", "REOPENED"] as const;

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

export default async function AdminLedgerPage() {
  const [openCount, awaitingCount, totalClients, totalSites, recent] =
    await Promise.all([
      prisma.ticket.count({ where: { status: { in: [...OPEN_STATUSES] } } }),
      prisma.ticket.count({ where: { status: "AWAITING_CONFIRMATION" } }),
      prisma.clientAccount.count(),
      prisma.site.count(),
      prisma.ticket.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          site: { select: { displayName: true } },
          clientAccount: { select: { name: true } },
        },
      }),
    ]);

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <LedgerLiveRefresh />

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Editorial Desk
        </span>
      </div>

      <h1
        className="font-display text-4xl md:text-6xl leading-none mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Live Ledger
      </h1>
      <p className="font-display italic text-ink-mute text-base md:text-lg mb-10 max-w-2xl">
        The newsroom floor — where dispatches land and the red light goes on.
      </p>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border border-rule mb-12">
        <Stat label="Open Tickets" value={openCount} accent="signal-red" />
        <Stat label="Awaiting Confirm" value={awaitingCount} />
        <Stat label="Clients" value={totalClients} />
        <Stat label="Sites" value={totalSites} />
      </div>

      {/* Recent tickets */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-8 items-start">
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
              §
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              Recent Dispatches
            </span>
            <span className="h-px flex-1 bg-rule-soft" />
            <Link
              href="/admin/tickets"
              className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
            >
              All →
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="font-display italic text-ink-mute">
              No tickets filed yet. The board&rsquo;s clean.
            </p>
          ) : (
            <ul className="rule-thin pt-3 divide-y divide-rule-soft">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/ticket/${t.id}`}
                    className="block py-3 hover:bg-parchment-warm/40 transition-colors px-2"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <StatusPill status={t.status} />
                          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade">
                            {ticketNumber(t.id, t.createdAt)}
                          </span>
                        </div>
                        <p className="font-display text-base text-ink truncate">
                          {t.title}
                        </p>
                        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mt-1 truncate">
                          {t.clientAccount.name} · {t.site.displayName}
                        </p>
                      </div>
                      <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade md:text-right shrink-0 mt-1 md:mt-0">
                        {formatRelative(t.createdAt)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick actions */}
        <aside>
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
              §
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              On Deck
            </span>
            <span className="h-px flex-1 bg-rule-soft" />
          </div>
          <ul className="space-y-2">
            <QuickAction href="/admin/invites/new" label="File a new invite →" />
            <QuickAction href="/admin/tickets" label="Work the ticket queue →" />
            <QuickAction href="/admin/clients" label="Browse client roster →" />
          </ul>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "signal-red";
}) {
  return (
    <div className="bg-parchment-warm px-5 py-4">
      <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-1">
        {label}
      </p>
      <p
        className={`font-display text-3xl md:text-4xl leading-none ${
          accent === "signal-red" ? "text-signal-red" : "text-ink"
        }`}
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        {value}
      </p>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block px-4 py-3 border border-rule hover:border-signal-red transition-colors font-mono text-[0.7rem] uppercase tracking-wider text-ink-soft hover:text-signal-red"
      >
        {label}
      </Link>
    </li>
  );
}
