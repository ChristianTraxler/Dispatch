"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { PresenceDot } from "./PresenceDot";
import { Avatar } from "./Avatar";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";
import { ChevronIcon } from "@/app/admin/docket-icons";

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
  /** Last seen timestamp, only relevant when offline */
  lastSeenAt?: string | Date | null;
  /** Signed avatar URL or null */
  avatarUrl?: string | null;
  sites: AdminClientSite[];
}

export interface AdminClientsPageProps {
  clients: AdminClient[];
  onMessageClient?: (clientId: string) => void;
  onViewSiteTickets?: (siteId: string) => void;
  onUpdateEmail?: (clientId: string, newEmail: string) => Promise<{ ok: boolean; error?: string }>;
  className?: string;
  style?: CSSProperties;
}

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { timeZone: DISPLAY_TIME_ZONE, month: "short", day: "2-digit", year: "numeric" });
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
  return d.toLocaleString("en-US", { timeZone: DISPLAY_TIME_ZONE, month: "short", day: "2-digit" });
}

export function AdminClientsPage({
  clients,
  onMessageClient,
  onViewSiteTickets,
  onUpdateEmail,
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
    <div className={className} style={style}>
      <div className="dk-head">
        <div className="dk-txt">
          <span className="dk-k">Subscriber Roll</span>
          <h1>Clients</h1>
          <p>Every account on the desk, with their sites and live status.</p>
        </div>
      </div>

      {/* Top stats */}
      <div className="dk-stats mb-6">
        <Stat label="Total clients" value={clients.length} />
        <Stat
          label="Online now"
          value={onlineCount}
          accent={onlineCount > 0 ? "var(--dk-live)" : undefined}
        />
        <Stat
          label="Open tickets"
          value={totalOpenTickets}
          accent={totalOpenTickets > 0 ? "var(--dk-signal-text)" : undefined}
        />
      </div>

      {/* Client rows */}
      {clients.length > 0 && (
        <div className="dk-card dk-list">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onMessage={() => onMessageClient?.(client.id)}
              onViewSiteTickets={onViewSiteTickets}
              onUpdateEmail={onUpdateEmail}
            />
          ))}
        </div>
      )}

      {clients.length === 0 && (
        <div className="dk-emptyslip">
          <p>No clients yet. Send your first invite to get started.</p>
        </div>
      )}
      <p className="dk-tally">Total sites tracked: {totalSites}</p>
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
    <div className={`dk-card dk-stat${value === 0 ? " dk-zero" : ""}`}>
      <b style={{ color: accent }}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function ClientCard({
  client,
  onMessage,
  onViewSiteTickets,
  onUpdateEmail,
}: {
  client: AdminClient;
  onMessage: () => void;
  onViewSiteTickets?: (siteId: string) => void;
  onUpdateEmail?: (clientId: string, newEmail: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [draftEmail, setDraftEmail] = useState(client.email);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  async function handleSaveEmail() {
    if (!onUpdateEmail) return;
    setEmailErr(null);
    const trimmed = draftEmail.trim().toLowerCase();
    if (trimmed === client.email.toLowerCase()) {
      setEditingEmail(false);
      return;
    }
    if (!confirm(`Change ${client.name}'s email to ${trimmed}? They will be signed out of all sessions.`)) {
      return;
    }
    setEmailBusy(true);
    const result = await onUpdateEmail(client.id, trimmed);
    setEmailBusy(false);
    if (!result.ok) {
      setEmailErr(result.error ?? "Could not update email.");
      return;
    }
    setEditingEmail(false);
  }

  const totalTickets = client.sites.reduce((s, st) => s + st.totalTickets, 0);
  const openTickets = client.sites.reduce((s, st) => s + st.openTickets, 0);

  return (
    <div className="dk-crow">
        {/* Identity */}
        <div className="dk-cmain">
          <Link
            href={`/admin/clients/${client.id}`}
            className="shrink-0"
            aria-label={`View details for ${client.name}`}
          >
            <Avatar
              src={client.avatarUrl ?? null}
              name={client.name}
              size={48}
              tone="client"
            />
          </Link>
          <div className="min-w-0">
            <h2 className="dk-cname">
              <Link
                href={`/admin/clients/${client.id}`}
                className="hover:text-accent transition-colors"
              >
                {client.name}
              </Link>
              <PresenceDot
                status={client.isOnline ? "online" : "offline"}
                pulse={client.isOnline}
              />
            </h2>
            <div className="dk-cmail mt-0.5">
              {editingEmail ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    className="dk-tin min-w-[220px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingEmail(false);
                        setDraftEmail(client.email);
                        setEmailErr(null);
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveEmail();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveEmail()}
                    disabled={emailBusy}
                    className="dk-link disabled:opacity-50"
                  >
                    {emailBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEmail(false);
                      setDraftEmail(client.email);
                      setEmailErr(null);
                    }}
                    disabled={emailBusy}
                    className="dk-tbtn"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{client.email}</span>
                  {onUpdateEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmail(true);
                        setDraftEmail(client.email);
                        setEmailErr(null);
                      }}
                      className="dk-link"
                      aria-label={`Edit email for ${client.name}`}
                    >
                      Edit
                    </button>
                  )}
                </span>
              )}
              {emailErr && (
                <span className="block normal-case tracking-normal text-signal-redDeep mt-1">
                  {emailErr}
                </span>
              )}
            </div>
            <div className="dk-cjoined mt-1">
              Joined {formatDate(client.joinedAt)}
              {!client.isOnline && client.lastSeenAt && (
                <> · last seen {formatRelative(client.lastSeenAt)}</>
              )}
              {client.isOnline && <> · live now</>}
            </div>
          </div>
        </div>

        <div className="dk-cside">
        {/* Stats */}
        <div className="dk-counts">
          <div className={client.sites.length === 0 ? "dk-z" : undefined}>
            <b>{client.sites.length}</b>
            <span>Site{client.sites.length === 1 ? "" : "s"}</span>
          </div>
          <div className={totalTickets === 0 ? "dk-z" : undefined}>
            <b>{totalTickets}</b>
            <span>Tickets</span>
          </div>
          <div className={openTickets === 0 ? "dk-z" : undefined}>
            <b className={openTickets > 0 ? "text-accent" : undefined}>{openTickets}</b>
            <span>Open</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 md:flex-shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="dk-btn dk-sm"
            aria-expanded={expanded}
          >
            Sites
            <ChevronIcon className="dk-chev" />
          </button>
          {client.isOnline && (
            <button type="button" onClick={onMessage} className="dk-btn dk-sm dk-primary">
              Message
            </button>
          )}
        </div>
        </div>

      {/* Expanded site list */}
      {expanded && (
        <div className="dk-sites dk-sites-list">
          <div className="dk-slab mb-1">
            Registered sites
          </div>
          {client.sites.map((site, i) => (
            <button
              key={site.id}
              type="button"
              onClick={() => onViewSiteTickets?.(site.id)}
              className={[
                "w-full text-left flex items-center gap-4 py-2 hover:text-accent transition-colors",
                i < client.sites.length - 1 ? "border-b border-ruleSoft" : "",
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink truncate">
                  {site.displayName}
                </div>
                <div className="dk-mono text-[0.71875rem] text-ink-mute truncate">
                  {site.url}
                </div>
              </div>
              <div className="text-[0.8125rem] text-ink-mute flex-shrink-0">
                {site.totalTickets} ticket{site.totalTickets === 1 ? "" : "s"}
                {site.openTickets > 0 && (
                  <>
                    {" · "}
                    <span className="text-accent">{site.openTickets} open</span>
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
