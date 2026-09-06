import { type CSSProperties } from "react";

export type TicketStatus =
  | "NEW"
  | "REVIEWING"
  | "FIXING"
  | "AWAITING_CONFIRMATION"
  | "CLOSED"
  | "REOPENED";

// Themed through CSS variables rather than hex: these sit on a translucent
// pill whose bed flips with the theme, so the ink has to flip with it.
const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  NEW: { label: "New", color: "rgb(var(--ink))" },
  REVIEWING: { label: "Reviewing", color: "rgb(var(--status-reviewing))" },
  FIXING: { label: "Fixing", color: "rgb(var(--signal-red-deep))" },
  AWAITING_CONFIRMATION: { label: "Awaiting Confirmation", color: "rgb(var(--status-awaiting))" },
  CLOSED: { label: "Closed", color: "rgb(var(--signal-green))" },
  REOPENED: { label: "Reopened", color: "rgb(var(--signal-red))" },
};

export interface StatusPillProps {
  status: TicketStatus;
  className?: string;
  style?: CSSProperties;
}

export function StatusPill({ status, className = "", style }: StatusPillProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`status-pill ${className}`}
      style={{ color: config.color, ...style }}
    >
      {config.label}
    </span>
  );
}
