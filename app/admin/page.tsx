import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ticketNumber } from "@/lib/ticket";
import { StatusPill } from "@/components/StatusPill";
import { LedgerLiveRefresh } from "./ledger-live-refresh";
import { OnlineClientsPanel } from "./online-clients-panel";
import { PageHead, TicketStub } from "./docket-ui";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";

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
  const [openCount, awaitingCount, inquiryCount, totalClients, totalSites, recent] =
    await Promise.all([
      prisma.ticket.count({
        where: {
          isInquiry: false,
          status: { in: [...OPEN_STATUSES] },
        },
      }),
      prisma.ticket.count({
        where: { isInquiry: false, status: "AWAITING_CONFIRMATION" },
      }),
      prisma.ticket.count({
        where: { isInquiry: true, inquiryEndedAt: null },
      }),
      prisma.clientAccount.count(),
      prisma.site.count(),
      prisma.ticket.findMany({
        where: { isInquiry: false },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          site: { select: { displayName: true } },
          clientAccount: { select: { name: true } },
        },
      }),
    ]);

  return (
    <div>
      <LedgerLiveRefresh />

      <PageHead
        eyebrow="Editorial Desk"
        title="Live Ledger"
        sub="The newsroom floor — where dispatches land and the red light goes on."
      />

      {/* Stat strip */}
      <div className="dk-stats dk-stats-5 mb-10">
        <Stat label="Open Tickets" value={openCount} accent="signal-red" />
        <Stat label="Awaiting Confirm" value={awaitingCount} />
        <Stat label="Open Inquiries" value={inquiryCount} />
        <Stat label="Clients" value={totalClients} />
        <Stat label="Sites" value={totalSites} />
      </div>

      {/* Recent tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-start">
        <section className="min-w-0">
          <div className="dk-ghead">
            <h2>Recent Dispatches</h2>
            <Link href="/admin/tickets" className="dk-link">
              All →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="dk-emptyslip">
              <p>No tickets filed yet. The board&rsquo;s clean.</p>
            </div>
          ) : (
            <div className="dk-stubs">
              {recent.map((t) => (
                <TicketStub
                  key={t.id}
                  href={`/admin/ticket/${t.id}`}
                  date={t.createdAt}
                  timeZone={DISPLAY_TIME_ZONE}
                  top={
                    <>
                      <StatusPill status={t.status} className="shrink-0" />
                      <span className="dk-id dk-mono">{ticketNumber(t.id, t.createdAt)}</span>
                    </>
                  }
                  title={t.title}
                  by={
                    <>
                      {t.clientAccount.name} <em>&middot;</em> {t.site.displayName}
                    </>
                  }
                  when={<b>{formatRelative(t.createdAt)}</b>}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right column: live presence + quick actions */}
        <aside className="space-y-8 min-w-0">
          <OnlineClientsPanel />

          <BillingRulesNote />

          <div>
            <div className="dk-slab mb-3">
              <span>On Deck</span>
            </div>
            <ul className="space-y-2">
              <QuickAction href="/admin/invites/new" label="Send a new invite →" />
              <QuickAction href="/admin/tickets" label="Work the ticket queue →" />
              <QuickAction href="/admin/clients" label="Browse client roster →" />
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BillingRulesNote() {
  return (
    <div className="dk-card px-5 py-5">
      <div className="dk-slab mb-3">
        <span className="dk-hot">Before You Start Work</span>
      </div>

      <p className="font-semibold text-ink text-sm leading-snug mb-3">
        Invoice first. Work begins only after payment lands.
      </p>

      <ul className="space-y-2.5 text-xs text-ink-soft leading-snug">
        <li>
          <span className="font-mono text-[0.8125rem] text-ink-mute block mb-0.5">
            Small one-time &lt; $500
          </span>
          <span className="font-display">
            100% upfront. Small enough nobody balks; not worth splitting.
          </span>
        </li>
        <li>
          <span className="font-mono text-[0.8125rem] text-ink-mute block mb-0.5">
            Larger one-time $500+
          </span>
          <span className="font-display">
            50% deposit, 50% on delivery. Standard project terms — deposit
            secures their commitment, balance protects them.
          </span>
        </li>
        <li>
          <span className="font-mono text-[0.8125rem] text-ink-mute block mb-0.5">
            Recurring (monthly)
          </span>
          <span className="font-display">
            Bill in advance each period. No deposit — small enough, either
            side can cancel.
          </span>
        </li>
      </ul>

      <p className="text-ink-mute text-xs leading-snug mt-3 pt-3 border-t border-rule-soft">
        These are existing Dispatch clients — lean lighter: 100% upfront for
        the small stuff, 50-50 only when the dollar amount makes it awkward
        to ask in one shot.
      </p>
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
    <div className={`dk-card dk-stat${value === 0 ? " dk-zero" : ""}`}>
      <b className={accent === "signal-red" && value > 0 ? "text-accent" : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="dk-btn w-full !justify-start"
      >
        {label}
      </Link>
    </li>
  );
}
