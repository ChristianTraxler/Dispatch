"use client";

import { useState, type CSSProperties } from "react";
import { PresenceDot } from "./PresenceDot";
import { Avatar } from "./Avatar";

export interface AdminClientSite {
  id: string;
  url: string;
  displayName: string;
  totalTickets: number;
  openTickets: number;
}

export interface AdminClient {
  id: string;
  name: string;
  email: string;
  joinedAt: string | Date;
  /** Currently online (driven by Supabase Presence) */
  isOnline: boolean;
  /** Last seen timestamp — only relevant when offline */
  lastSeenAt?: string | Date | null;
  /** Signed avatar URL or null */
  avatarUrl?: string | null;
  sites: AdminClientSite[];
}

export interface AdminClientsPageProps {
  clients: AdminClient[];
  onMessageClient?: (clientId: string) => void;
  onViewSiteTickets?: (siteId: string) => void;
  className?: string;
  style?: CSSProperties;
}

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
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

export function AdminClientsPage({
  clients,
  onMessageClient,
  onViewSiteTickets,
  className = "",
  style,
}: AdminClientsPageProps) {
  const onlineCount = clients.filter((c) => c.isOnline).length;
  const totalSites = clients.reduce((sum, c) => sum + c.sites.length, 0);
  const totalOpenTickets = clients.reduce(
    (sum, c) => sum + c.sites.reduce((ssum, s) => ssum + s.openTickets, 0),
    0,
  );

  return (
    <div className={`max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Subscriber Roll
        </span>
      </div>

      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-2"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Clients
      </h1>
      <p className="font-display italic text-ink-mute mb-8 text-base">
        Every account on the desk, with their sites and live status.
      </p>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-4 md:gap-8 mb-10 rule-thin pb-6">
        <Stat label="Total clients" value={clients.length} />
        <Stat
          label="Online now"
          value={onlineCount}
          accent={onlineCount > 0 ? "var(--signal-green)" : undefined}
        />
        <Stat
          label="Open tickets"
          value={totalOpenTickets}
          accent={totalOpenTickets > 0 ? "var(--signal-red)" : undefined}
        />
      </div>

      {/* Client cards */}
      <div className="space-y-4">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onMessage={() => onMessageClient?.(client.id)}
            onViewSiteTickets={onViewSiteTickets}
          />
        ))}
      </div>

      {clients.length === 0 && (
        <div className="text-center py-16 rule-thin border-t">
          <p className="font-display italic text-ink-mute">
            No clients yet. Send your first invite to get started.
          </p>
        </div>
      )}
      <p className="text-xs text-ink-fade mt-2">Total sites tracked: {totalSites}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div>
      <div
        className="font-display text-3xl md:text-4xl leading-none"
        style={{ color: accent, fontVariationSettings: '"opsz" 144' }}
      >
        {value}
      </div>
      <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
        {label}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  onMessage,
  onViewSiteTickets,
}: {
  client: AdminClient;
  onMessage: () => void;
  onViewSiteTickets?: (siteId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalTickets = client.sites.reduce((s, st) => s + st.totalTickets, 0);
  const openTickets = client.sites.reduce((s, st) => s + st.openTickets, 0);

  return (
    <div className="border border-ruleSoft bg-parchment-warm">
      <div className="flex flex-col md:flex-row md:items-center gap-4 px-4 md:px-5 py-4">
        {/* Identity */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="relative shrink-0">
            <Avatar
              src={client.avatarUrl ?? null}
              name={client.name}
              size={48}
              tone="client"
            />
            <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-parchment-warm rounded-full">
              <PresenceDot
                status={client.isOnline ? "online" : "offline"}
                pulse={client.isOnline}
              />
            </span>
          </div>
          <div className="min-w-0">
            <h2
              className="font-display text-lg md:text-xl leading-tight"
              style={{ fontVariationSettings: '"opsz" 144' }}
            >
              {client.name}
            </h2>
            <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
              {client.email}
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade mt-1">
              Joined {formatDate(client.joinedAt)}
              {!client.isOnline && client.lastSeenAt && (
                <> · last seen {formatRelative(client.lastSeenAt)}</>
              )}
              {client.isOnline && <> · live now</>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 md:gap-8 md:text-right">
          <div>
            <div className="font-display text-xl text-ink leading-none">
              {client.sites.length}
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
              Site{client.sites.length === 1 ? "" : "s"}
            </div>
          </div>
          <div>
            <div className="font-display text-xl text-ink leading-none">{totalTickets}</div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
              Tickets
            </div>
          </div>
          <div>
            <div
              className={[
                "font-display text-xl leading-none",
                openTickets > 0 ? "text-signal-red" : "text-ink-fade",
              ].join(" ")}
            >
              {openTickets}
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
              Open
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:flex-shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost"
          >
            {expanded ? "↑ Sites" : "↓ Sites"}
          </button>
          {client.isOnline && (
            <button type="button" onClick={onMessage} className="btn-dispatch">
              Message
            </button>
          )}
        </div>
      </div>

      {/* Expanded site list */}
      {expanded && (
        <div className="border-t border-ruleSoft bg-parchment px-4 md:px-5 py-3">
          <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mb-2">
            Registered sites
          </div>
          {client.sites.map((site, i) => (
            <button
              key={site.id}
              type="button"
              onClick={() => onViewSiteTickets?.(site.id)}
              className={[
                "w-full text-left flex items-center gap-4 py-2 hover:text-signal-red transition-colors",
                i < client.sites.length - 1 ? "border-b border-ruleSoft" : "",
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="font-display text-base text-ink truncate">
                  {site.displayName}
                </div>
                <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute truncate">
                  {site.url}
                </div>
              </div>
              <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute flex-shrink-0">
                {site.totalTickets} ticket{site.totalTickets === 1 ? "" : "s"}
                {site.openTickets > 0 && (
                  <>
                    {" · "}
                    <span className="text-signal-red">{site.openTickets} open</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
