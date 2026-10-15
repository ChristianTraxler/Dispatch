"use client";

import { useState, type CSSProperties } from "react";
import { ArrowIcon } from "@/app/admin/docket-icons";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";

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
  onRenew?: (inviteId: string) => void | Promise<void>;
  onCopyLink?: (inviteUrl: string) => void;
  className?: string;
  style?: CSSProperties;
}

type Filter = "ALL" | InviteStatus;

const STATUS_COLORS: Record<InviteStatus, string> = {
  PENDING: "rgb(var(--status-reviewing))",
  REDEEMED: "rgb(var(--signal-green))",
  EXPIRED: "rgb(var(--ink-mute))",
  REVOKED: "rgb(var(--signal-red))",
};

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { timeZone: DISPLAY_TIME_ZONE, month: "short", day: "2-digit", year: "numeric" });
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
  onRenew,
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
    <div className={className} style={style}>
      <div className="dk-head">
        <div className="dk-txt">
          <span className="dk-k">Invitation Roster</span>
          <h1>Invites</h1>
          <p>Active and historical invitations. Click an invite to copy its link.</p>
        </div>
        <button type="button" onClick={onCreateInvite} className="dk-btn dk-primary">
          + Send invite
        </button>
      </div>

      {/* Filter chips */}
      <div className="dk-filters mb-5">
        <span className="dk-flabel">Status</span>
        {(["ALL", "PENDING", "REDEEMED", "EXPIRED", "REVOKED"] as Filter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className="dk-chip"
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
            <span className="dk-c">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Invite list */}
      {filtered.length === 0 ? (
        <div className="dk-emptyslip">
          <p>No invites in this bucket.</p>
        </div>
      ) : (
        <div className="dk-card dk-list">
          {filtered.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onCopyLink={onCopyLink}
              onRevoke={onRevoke}
              onRenew={onRenew}
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
  onRenew,
}: {
  invite: AdminInvite;
  onCopyLink?: (url: string) => void;
  onRevoke?: (id: string) => void | Promise<void>;
  onRenew?: (id: string) => void | Promise<void>;
}) {
  const [revoking, setRevoking] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const color = STATUS_COLORS[invite.status];
  const canRevoke = invite.status === "PENDING";
  const canCopy = invite.status === "PENDING";
  const canRenew = invite.status === "EXPIRED";

  return (
    <div className="dk-irow">
      {/* Status pill, left column */}
      <div className="flex items-center gap-3">
        <span className="status-pill dk-caps" style={{ color }}>
          {invite.status}
        </span>
      </div>

      {/* Email + site, middle */}
      <div className="flex-1 min-w-0">
        <div className="leading-tight">
          {invite.recipientName ? (
            <>
              <span className="dk-nm">{invite.recipientName}</span>
              <span className="dk-em"> · {invite.email}</span>
            </>
          ) : (
            <span className="dk-nm">{invite.email}</span>
          )}
        </div>
        <div className="dk-to">
          <ArrowIcon />
          <span>
            {invite.siteDisplayName} <em>· {invite.siteUrl}</em>
          </span>
        </div>
      </div>

      {/* Dates, right column */}
      <div className="dk-dates">
        <div>
          Sent {formatDate(invite.createdAt)}
        </div>
        {invite.status === "PENDING" && (
          <div>
            Expires {formatRelative(invite.expiresAt)}
          </div>
        )}
        {invite.status === "REDEEMED" && invite.redeemedAt && (
          <div className="dk-ok">
            Redeemed {formatDate(invite.redeemedAt)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="dk-iacts">
        {canCopy && (
          <button
            type="button"
            onClick={() => onCopyLink?.(invite.inviteUrl)}
            className="dk-btn dk-sm"
          >
            ↳ Copy link
          </button>
        )}
        {canRenew && (
          <button
            type="button"
            disabled={renewing}
            onClick={async () => {
              setRenewing(true);
              try {
                await onRenew?.(invite.id);
              } finally {
                setRenewing(false);
              }
            }}
            className="dk-tbtn"
          >
            {renewing ? "Renewing…" : "↻ Renew"}
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
            className="dk-tbtn dk-danger"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        )}
      </div>
    </div>
  );
}
