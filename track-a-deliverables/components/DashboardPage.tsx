"use client";

import { useState, type CSSProperties } from "react";
import { StatusPill, type TicketStatus } from "./StatusPill";

export interface DashboardTicket {
  id: string;
  ticketNumber: string; // display ID e.g. "DSP-2026-05-04-A3F9"
  title: string;
  siteId: string;
  siteUrl: string;
  status: TicketStatus;
  lastActivityAt: string | Date;
  unreadCount?: number;
  messageCount: number;
}

export interface DashboardSite {
  id: string;
  url: string;
  displayName: string;
}

export interface DashboardPageProps {
  tickets: DashboardTicket[];
  sites: DashboardSite[];
  onOpenTicket?: (ticketId: string) => void;
  onNewTicket?: () => void;
  className?: string;
  style?: CSSProperties;
}

type StatusFilter = "ALL" | "OPEN" | "AWAITING" | "CLOSED";

function statusToFilter(s: TicketStatus): StatusFilter {
  if (s === "CLOSED") return "CLOSED";
  if (s === "AWAITING_CONFIRMATION") return "AWAITING";
  return "OPEN";
}

function formatRelative(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit" });
}

export function DashboardPage({
  tickets,
  sites,
  onOpenTicket,
  onNewTicket,
  className = "",
  style,
}: DashboardPageProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [siteFilter, setSiteFilter] = useState<string | null>(null);

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "ALL" && statusToFilter(t.status) !== statusFilter) return false;
    if (siteFilter && t.siteId !== siteFilter) return false;
    return true;
  });

  const counts = {
    ALL: tickets.length,
    OPEN: tickets.filter((t) => statusToFilter(t.status) === "OPEN").length,
    AWAITING: tickets.filter((t) => statusToFilter(t.status) === "AWAITING").length,
    CLOSED: tickets.filter((t) => statusToFilter(t.status) === "CLOSED").length,
  };

  return (
    <div className={`max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §01
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Live Ledger
        </span>
      </div>
      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-2"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Your dispatches
      </h1>
      <p className="font-display italic text-ink-mute mb-8 text-base">
        Every ticket you've filed, with current status.
      </p>

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 rule-thin pb-5">
        <FilterRow label="Status">
          {(["ALL", "OPEN", "AWAITING", "CLOSED"] as StatusFilter[]).map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
              <span className="ml-2 text-ink-fade">{counts[s]}</span>
            </FilterChip>
          ))}
        </FilterRow>

        {sites.length > 1 && (
          <FilterRow label="Site">
            <FilterChip active={siteFilter === null} onClick={() => setSiteFilter(null)}>
              All sites
            </FilterChip>
            {sites.map((s) => (
              <FilterChip
                key={s.id}
                active={siteFilter === s.id}
                onClick={() => setSiteFilter(s.id)}
              >
                {s.displayName}
              </FilterChip>
            ))}
          </FilterRow>
        )}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <EmptyState onNewTicket={onNewTicket} />
      ) : (
        <div>
          {filtered.map((t) => (
            <TicketRow key={t.id} ticket={t} onClick={() => onOpenTicket?.(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute md:w-16 flex-shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "font-mono text-[0.65rem] uppercase tracking-widest px-3 py-1.5 transition-colors whitespace-nowrap",
        active
          ? "bg-ink text-parchment-warm"
          : "border border-rule text-ink-soft hover:border-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function TicketRow({ ticket, onClick }: { ticket: DashboardTicket; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex flex-col md:flex-row md:items-center gap-2 md:gap-6 px-2 md:px-3 py-4 border-b border-ruleSoft hover:bg-parchment-warm transition-colors group"
    >
      {/* Status + ID — left column on desktop */}
      <div className="flex items-center gap-3 md:w-72 md:flex-shrink-0">
        <StatusPill status={ticket.status} />
        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-fade truncate">
          {ticket.ticketNumber}
        </span>
      </div>

      {/* Title + site — middle column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-display text-lg text-ink leading-snug group-hover:text-signal-red transition-colors">
            {ticket.title}
          </span>
          {ticket.unreadCount && ticket.unreadCount > 0 ? (
            <span className="font-mono text-[0.55rem] uppercase tracking-widest bg-signal-red text-parchment-warm px-1.5 py-0.5">
              {ticket.unreadCount} new
            </span>
          ) : null}
        </div>
        <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
          {ticket.siteUrl}
        </div>
      </div>

      {/* Activity — right column */}
      <div className="flex items-center gap-3 md:gap-4 md:flex-shrink-0 md:text-right">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          {ticket.messageCount} msg{ticket.messageCount === 1 ? "" : "s"}
        </span>
        <span className="text-ink-fade">·</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-soft">
          {formatRelative(ticket.lastActivityAt)}
        </span>
      </div>
    </button>
  );
}

function EmptyState({ onNewTicket }: { onNewTicket?: () => void }) {
  return (
    <div className="text-center py-16 md:py-20 rule-thin border-t">
      <div className="font-mono text-2xl text-ink-fade mb-4" aria-hidden="true">
        ─── ─── ───
      </div>
      <h2
        className="font-display text-2xl md:text-3xl mb-2"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        No dispatches on the wire.
      </h2>
      <p className="font-display italic text-ink-mute mb-6">
        When something breaks, file a ticket and we'll get on it.
      </p>
      {onNewTicket && (
        <button type="button" onClick={onNewTicket} className="btn-dispatch">
          File the first one
        </button>
      )}
    </div>
  );
}
