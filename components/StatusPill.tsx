import { type CSSProperties } from "react";

export type TicketStatus =
  | "NEW"
  | "REVIEWING"
  | "FIXING"
  | "AWAITING_CONFIRMATION"
  | "CLOSED"
  | "REOPENED";

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  NEW: { label: "New", color: "#1A1815" },
  REVIEWING: { label: "Reviewing", color: "#7A4E1F" },
  FIXING: { label: "Fixing", color: "#9E2614" },
  AWAITING_CONFIRMATION: { label: "Awaiting Confirmation", color: "#5B6B1F" },
  CLOSED: { label: "Closed", color: "#2E7D3F" },
  REOPENED: { label: "Reopened", color: "#C8341A" },
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
