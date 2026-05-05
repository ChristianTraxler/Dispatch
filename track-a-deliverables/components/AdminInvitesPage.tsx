"use client";

import { useState, type CSSProperties } from "react";

export type InviteStatus = "PENDING" | "REDEEMED" | "EXPIRED" | "REVOKED";

export interface AdminInvite {
  id: string;
  email: string;
  recipientName?: string;
  siteUrl: string;
  siteDisplayName: string;
  status: InviteStatus;
  createdAt: string | Date;
  expiresAt: string | Date;
  redeemedAt?: string | Date | null;
  redeemedByEmail?: string | null;
  inviteUrl: string; // full invite URL including token
}

export interface AdminInvitesPageProps {
  invites: AdminInvite[];
  onCreateInvite?: () => void;
  onRevoke?: (inviteId: string) => void | Promise<void>;
  onCopyLink?: (inviteUrl: string) => void;
  className?: string;
  style?: CSSProperties;
}

type Filter = "ALL" | InviteStatus;

const STATUS_COLORS: Record<InviteStatus, string> = {
  PENDING: "#7A4E1F",
  REDEEMED: "#2E7D3F",
  EXPIRED: "#6B665E",
  REVOKED: "#C8341A",
};

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function formatRelative(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = d.getTime() - Date.now();
  const days = Math.round(diff / (24 * 3600_000));
  if (Math.abs(days) < 1) return "today";
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

export function AdminInvitesPage({
  invites,
  onCreateInvite,
  onRevoke,
  onCopyLink,
  className = "",
  style,
}: AdminInvitesPageProps) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts: Record<Filter, number> = {
    ALL: invites.length,
    PENDING: invites.filter((i) => i.status === "PENDING").length,
    REDEEMED: invites.filter((i) => i.status === "REDEEMED").length,
    EXPIRED: invites.filter((i) => i.status === "EXPIRED").length,
    REVOKED: invites.filter((i) => i.status === "REVOKED").length,
  };

  const filtered = filter === "ALL" ? invites : invites.filter((i) => i.status === filter);

  return (
    <div className={`max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Invitation Roster
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1
            className="font-display text-3xl md:text-5xl leading-none mb-2"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Invites
          </h1>
          <p className="font-display italic text-ink-mute text-base">
            Active and historical invitations. Click an invite to copy its link.
          </p>
        </div>
        <button type="button" onClick={onCreateInvite} className="btn-dispatch">
          + Send invite
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6 rule-thin pb-5">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mr-2">
          Status
        </span>
        {(["ALL", "PENDING", "REDEEMED", "EXPIRED", "REVOKED"] as Filter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={[
              "font-mono text-[0.65rem] uppercase tracking-widest px-3 py-1.5 transition-colors whitespace-nowrap",
              filter === s
                ? "bg-ink text-parchment-warm"
                : "border border-rule text-ink-soft hover:border-ink",
            ].join(" ")}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
            <span className="ml-2 text-ink-fade">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Invite list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rule-thin border-t">
          <p className="font-display italic text-ink-mute">
            No invites in this bucket.
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onCopyLink={onCopyLink}
              onRevoke={onRevoke}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  onCopyLink,
  onRevoke,
}: {
  invite: AdminInvite;
  onCopyLink?: (url: string) => void;
  onRevoke?: (id: string) => void | Promise<void>;
}) {
  const [revoking, setRevoking] = useState(false);
  const color = STATUS_COLORS[invite.status];
  const canRevoke = invite.status === "PENDING";
  const canCopy = invite.status === "PENDING";

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 px-2 md:px-3 py-4 border-b border-ruleSoft hover:bg-parchment-warm transition-colors">
      {/* Status pill — left column */}
      <div className="md:w-40 flex-shrink-0 flex items-center gap-3">
        <span className="status-pill" style={{ color }}>
          {invite.status}
        </span>
      </div>

      {/* Email + site — middle */}
      <div className="flex-1 min-w-0">
        <div className="font-display text-base text-ink leading-tight">
          {invite.recipientName ? (
            <>
              <span>{invite.recipientName}</span>
              <span className="text-ink-fade mx-1.5">·</span>
              <span className="font-mono text-xs text-ink-mute">{invite.email}</span>
            </>
          ) : (
            <span className="font-mono text-sm">{invite.email}</span>
          )}
        </div>
        <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
          → {invite.siteDisplayName} · {invite.siteUrl}
        </div>
      </div>

      {/* Dates — right column */}
      <div className="md:w-44 md:text-right flex-shrink-0">
        <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Sent {formatDate(invite.createdAt)}
        </div>
        {invite.status === "PENDING" && (
          <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade">
            Expires {formatRelative(invite.expiresAt)}
          </div>
        )}
        {invite.status === "REDEEMED" && invite.redeemedAt && (
          <div className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-green">
            Redeemed {formatDate(invite.redeemedAt)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:flex-shrink-0">
        {canCopy && (
          <button
            type="button"
            onClick={() => onCopyLink?.(invite.inviteUrl)}
            className="btn-ghost"
          >
            ↳ Copy link
          </button>
        )}
        {canRevoke && (
          <button
            type="button"
            disabled={revoking}
            onClick={async () => {
              if (!confirm(`Revoke invite for ${invite.email}?`)) return;
              setRevoking(true);
              try {
                await onRevoke?.(invite.id);
              } finally {
                setRevoking(false);
              }
            }}
            className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors px-2"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        )}
      </div>
    </div>
  );
}
