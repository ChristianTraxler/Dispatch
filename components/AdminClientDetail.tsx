"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { PresenceDot } from "./PresenceDot";
import { StatusPill, type TicketStatus } from "./StatusPill";
import { FreeWindowStatusLabel } from "./FreeWindowStatusLabel";
import type { FreeWindowStatus } from "@/lib/free-updates";

export interface AdminClientDetailSite {
  id: string;
  url: string;
  displayName: string;
  totalTickets: number;
  openTickets: number;
  productionStartedAt: string | null;
}

export interface AdminClientDetailTicket {
  id: string;
  title: string;
  status: TicketStatus;
  createdAt: string;
  siteDisplayName: string;
  outOfFreeWindow: boolean;
}

export interface AdminClientDetailData {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt?: string | null;
  sites: AdminClientDetailSite[];
  recentTickets: AdminClientDetailTicket[];
  totals: {
    sites: number;
    tickets: number;
    openTickets: number;
    messages: number;
  };
}

export interface AdminClientDetailProps {
  client: AdminClientDetailData;
  onUpdateEmail?: (newEmail: string) => Promise<{ ok: boolean; error?: string }>;
  onMoveToProduction?: (siteId: string) => Promise<{ ok: boolean; error?: string }>;
  onResetProduction?: (siteId: string) => Promise<{ ok: boolean; error?: string }>;
  freeWindowStatusBySite: Record<string, FreeWindowStatus>;
  className?: string;
  style?: CSSProperties;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
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

export function AdminClientDetail({
  client,
  onUpdateEmail,
  onMoveToProduction,
  onResetProduction,
  freeWindowStatusBySite,
  className = "",
  style,
}: AdminClientDetailProps) {
  return (
    <div
      className={`max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`}
      style={style}
    >
      <Link
        href="/admin/clients"
        className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
      >
        ← Clients
      </Link>

      <div className="flex items-center gap-3 mb-3 mt-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Subscriber Profile
        </span>
      </div>

      <IdentityHeader client={client} onUpdateEmail={onUpdateEmail} />

      <StatsRow totals={client.totals} />

      <SitesSection
        sites={client.sites}
        freeWindowStatusBySite={freeWindowStatusBySite}
        onMoveToProduction={onMoveToProduction}
        onResetProduction={onResetProduction}
      />

      <RecentTicketsSection tickets={client.recentTickets} />
    </div>
  );
}

function IdentityHeader({
  client,
  onUpdateEmail,
}: {
  client: AdminClientDetailData;
  onUpdateEmail?: (newEmail: string) => Promise<{ ok: boolean; error?: string }>;
}) {
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
    if (
      !confirm(
        `Change ${client.name}'s email to ${trimmed}? They will be signed out of all sessions.`,
      )
    ) {
      return;
    }
    setEmailBusy(true);
    const result = await onUpdateEmail(trimmed);
    setEmailBusy(false);
    if (!result.ok) {
      setEmailErr(result.error ?? "Could not update email.");
      return;
    }
    setEditingEmail(false);
  }

  return (
    <div className="flex items-start gap-5 md:gap-6 mb-8 md:mb-10">
      <Avatar
        src={client.avatarUrl ?? null}
        name={client.name}
        size={80}
        tone="client"
      />
      <div className="min-w-0 flex-1">
        <h1
          className="flex items-center gap-3 font-display text-3xl md:text-5xl leading-none mb-2"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          <span>{client.name}</span>
          <PresenceDot
            status={client.isOnline ? "online" : "offline"}
            pulse={client.isOnline}
          />
        </h1>
        <div className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-soft mt-1">
          {editingEmail ? (
            <span className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                className="font-mono text-[0.7rem] uppercase tracking-wider text-ink-soft bg-parchment border border-rule px-2 py-1 min-w-[240px]"
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
                className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red hover:underline disabled:opacity-50"
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
                className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute hover:text-signal-red"
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
                  className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade hover:text-signal-red transition-colors"
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
        <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade mt-1">
          Joined {formatDate(client.joinedAt)}
          {!client.isOnline && client.lastSeenAt && (
            <> · last seen {formatRelative(client.lastSeenAt)}</>
          )}
          {client.isOnline && <> · live now</>}
        </div>
      </div>
    </div>
  );
}

function StatsRow({
  totals,
}: {
  totals: AdminClientDetailData["totals"];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 mb-10 rule-thin pb-6">
      <Stat label="Sites" value={totals.sites} />
      <Stat label="Total tickets" value={totals.tickets} />
      <Stat
        label="Open tickets"
        value={totals.openTickets}
        accent={totals.openTickets > 0 ? "var(--signal-red)" : undefined}
      />
      <Stat label="Messages" value={totals.messages} />
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

function SitesSection({
  sites,
  freeWindowStatusBySite,
  onMoveToProduction,
  onResetProduction,
}: {
  sites: AdminClientDetailSite[];
  freeWindowStatusBySite: Record<string, FreeWindowStatus>;
  onMoveToProduction?: (siteId: string) => Promise<{ ok: boolean; error?: string }>;
  onResetProduction?: (siteId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Sites
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
      {sites.length === 0 ? (
        <p className="font-display italic text-ink-mute">
          No sites registered yet.
        </p>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              status={freeWindowStatusBySite[site.id]}
              onMoveToProduction={onMoveToProduction}
              onResetProduction={onResetProduction}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SiteRow({
  site,
  status,
  onMoveToProduction,
  onResetProduction,
}: {
  site: AdminClientDetailSite;
  status: FreeWindowStatus | undefined;
  onMoveToProduction?: (siteId: string) => Promise<{ ok: boolean; error?: string }>;
  onResetProduction?: (siteId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleMove() {
    if (!onMoveToProduction) return;
    if (
      !confirm(
        `Mark ${site.displayName} as live? This starts the 30-day free-updates window.`,
      )
    ) {
      return;
    }
    setErr(null);
    setBusy(true);
    const r = await onMoveToProduction(site.id);
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not update.");
  }

  async function handleReset() {
    if (!onResetProduction) return;
    if (
      !confirm(
        `Reset production date for ${site.displayName}? The 30-day window will be cleared.`,
      )
    ) {
      return;
    }
    setErr(null);
    setBusy(true);
    const r = await onResetProduction(site.id);
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Could not update.");
  }

  return (
    <div className="border border-ruleSoft bg-parchment-warm px-4 md:px-5 py-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg text-ink truncate">
            {site.displayName}
          </div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute truncate">
            {site.url}
          </div>
        </div>
        <div className="flex items-center gap-6 md:text-right">
          <div>
            <div className="font-display text-base text-ink leading-none">
              {site.totalTickets}
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
              Tickets
            </div>
          </div>
          <div>
            <div
              className={[
                "font-display text-base leading-none",
                site.openTickets > 0 ? "text-signal-red" : "text-ink-fade",
              ].join(" ")}
            >
              {site.openTickets}
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
              Open
            </div>
          </div>
          <Link
            href={`/admin/tickets?site=${encodeURIComponent(site.id)}`}
            className="btn-ghost"
          >
            View tickets
          </Link>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-ruleSoft flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <FreeWindowStatusLabel status={status} />
        <div className="flex items-center gap-3">
          {status?.state === "not_in_production" && onMoveToProduction && (
            <button
              type="button"
              onClick={() => void handleMove()}
              disabled={busy}
              className="btn-dispatch disabled:opacity-50"
            >
              {busy ? "Saving…" : "Move to production"}
            </button>
          )}
          {status && status.state !== "not_in_production" && onResetProduction && (
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={busy}
              className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade hover:text-signal-red disabled:opacity-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      {err && (
        <div className="mt-2 text-xs text-signal-redDeep">{err}</div>
      )}
    </div>
  );
}

function RecentTicketsSection({
  tickets,
}: {
  tickets: AdminClientDetailTicket[];
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Recent tickets
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
      {tickets.length === 0 ? (
        <p className="font-display italic text-ink-mute">
          No tickets filed yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule-soft border-y border-ruleSoft">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/ticket/${t.id}`}
                className="flex items-center gap-4 py-3 px-2 hover:bg-parchment-warm/40 transition-colors"
              >
                <StatusPill status={t.status} />
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base text-ink truncate flex items-center gap-2">
                    <span className="truncate">{t.title}</span>
                    {t.outOfFreeWindow && <OutOfFreeWindowBadge />}
                  </div>
                  <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
                    {t.siteDisplayName}
                  </div>
                </div>
                <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade shrink-0">
                  {formatRelative(t.createdAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OutOfFreeWindowBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center font-mono text-[0.55rem] uppercase tracking-widest",
        "text-signal-red border border-signal-red px-1.5 py-0.5",
        className,
      ].join(" ")}
      title="This ticket was filed after the 30-day free-updates window expired."
    >
      Out of free window
    </span>
  );
}
