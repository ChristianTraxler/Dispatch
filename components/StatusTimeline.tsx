"use client";

import { Fragment, type CSSProperties } from "react";
import type { TicketStatus } from "./StatusPill";

export interface TicketTimestamps {
  createdAt: string | Date | null;
  receivedAt?: string | Date | null;
  firstViewedAt?: string | Date | null;
  reviewingStartedAt?: string | Date | null;
  fixingStartedAt?: string | Date | null;
  fixedAt?: string | Date | null;
  confirmedAt?: string | Date | null;
}

export interface StatusTimelineProps {
  ticket: TicketTimestamps;
  /** Current ticket status. Drives which stage gets the active/pulse treatment. */
  status?: TicketStatus;
  /** Ticket category. Tailors the wording of stages 4/5/6 to match the request type. */
  category?: string;
  /** Force a specific orientation. By default: horizontal on desktop, vertical on mobile. */
  orientation?: "auto" | "horizontal" | "vertical";
  /** Whether to show timestamps under each label. Defaults to true. */
  showTimestamps?: boolean;
  className?: string;
  style?: CSSProperties;
}

// Per-category wording for the work-in-progress stages (Reviewing / Working / Done).
// Stages 1-3 (Sent/Received/Viewed) are the same regardless of type.
const WORK_LABELS_BY_CATEGORY: Record<
  string,
  { reviewing: string; working: string; done: string }
> = {
  BUG:      { reviewing: "Reviewing Errors",   working: "Fixing Errors",    done: "Errors Fixed" },
  URGENT:   { reviewing: "Reviewing Issue",    working: "Fixing Issue",     done: "Issue Resolved" },
  CONTENT:  { reviewing: "Reviewing Changes",  working: "Making Changes",   done: "Changes Made" },
  UPDATE:   { reviewing: "Reviewing Update",   working: "Making Update",    done: "Update Complete" },
  FEATURE:  { reviewing: "Reviewing Request",  working: "Building Feature", done: "Feature Added" },
  QUESTION: { reviewing: "Reviewing Question", working: "Drafting Answer",  done: "Answered" },
};
const DEFAULT_WORK_LABELS = WORK_LABELS_BY_CATEGORY.BUG;

// Map the canonical TicketStatus to which of the six visible stages should
// be highlighted. Stages: 0=Sent 1=Received 2=Viewed 3=Reviewing 4=Fixing 5=Fixed.
function statusToStageIndex(
  status: TicketStatus,
  ticket: TicketTimestamps,
): number {
  switch (status) {
    case "NEW":
      return ticket.firstViewedAt ? 2 : 1;
    case "REVIEWING":
    case "REOPENED":
      // Reopened kicks the work back to the admin's queue → highlight Reviewing.
      return 3;
    case "FIXING":
      return 4;
    case "AWAITING_CONFIRMATION":
    case "CLOSED":
      return 5;
    default:
      return -1;
  }
}

interface Stage {
  key: keyof TicketTimestamps;
  label: string;
  timestamp: string | Date | null | undefined;
}

function formatStamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StatusTimeline({
  ticket,
  status,
  category,
  orientation = "auto",
  showTimestamps = true,
  className = "",
  style,
}: StatusTimelineProps) {
  const work = (category ? WORK_LABELS_BY_CATEGORY[category] : undefined) ?? DEFAULT_WORK_LABELS;
  const stages: Stage[] = [
    { key: "createdAt", label: "Sent", timestamp: ticket.createdAt },
    { key: "receivedAt", label: "Received", timestamp: ticket.receivedAt },
    { key: "firstViewedAt", label: "Viewed", timestamp: ticket.firstViewedAt },
    { key: "reviewingStartedAt", label: work.reviewing, timestamp: ticket.reviewingStartedAt },
    { key: "fixingStartedAt", label: work.working, timestamp: ticket.fixingStartedAt },
    { key: "fixedAt", label: work.done, timestamp: ticket.fixedAt },
  ];

  // Prefer the explicit status (so backward transitions move the marker too).
  // Fall back to the latest stage with a timestamp for callers that don't
  // pass status — keeps the original behaviour for legacy uses.
  let activeIndex = status ? statusToStageIndex(status, ticket) : -1;
  if (activeIndex < 0) {
    stages.forEach((s, i) => {
      if (s.timestamp) activeIndex = i;
    });
  }

  const orientationClass =
    orientation === "horizontal"
      ? "flex-row items-start"
      : orientation === "vertical"
        ? "flex-col items-stretch"
        : "flex-col items-stretch md:flex-row md:items-start";

  return (
    <div
      className={`flex ${orientationClass} ${className}`}
      style={style}
      role="list"
      aria-label="Ticket progress"
    >
      {stages.map((stage, i) => {
        // When the caller passed a status, "filled" tracks current position
        // (at or before the active stage). That way going FIXING → REVIEWING
        // un-fills Fixing Errors and Errors Fixed even though their timestamps
        // are still in the DB. Without status, fall back to the original
        // "every stage with a timestamp is filled" behaviour.
        const filled = status
          ? activeIndex >= 0 && i <= activeIndex
          : !!stage.timestamp;
        const isActive = i === activeIndex;
        const isLast = i === stages.length - 1;
        // Hide the timestamp text on stages we've rolled back past — keeps
        // the visual story consistent with the box state.
        const stamp =
          showTimestamps && filled ? formatStamp(stage.timestamp) : null;
        // Connector "filled" if THIS stage is filled (the line leading INTO the next stage)
        const connectorFilled = filled;

        return (
          <Fragment key={stage.key}>
            <StageNode
              label={stage.label}
              number={i + 1}
              filled={filled}
              isActive={isActive}
              timestamp={stamp}
            />
            {!isLast && <Connector filled={connectorFilled} />}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ============================================
   STAGE NODE
   ============================================ */
interface StageNodeProps {
  label: string;
  number: number;
  filled: boolean;
  isActive: boolean;
  timestamp: string | null;
}

function StageNode({ label, number, filled, isActive, timestamp }: StageNodeProps) {
  return (
    <div
      role="listitem"
      className="flex md:flex-col items-start md:items-center gap-3 md:gap-0 flex-shrink-0"
    >
      {/* Marker */}
      <div className="relative flex items-center justify-center flex-shrink-0">
        <span
          className={[
            "relative flex items-center justify-center w-7 h-7 font-mono text-[0.6rem] font-medium border z-10",
            filled
              ? "bg-ink text-parchment-warm border-ink"
              : "bg-parchment-warm text-ink-fade border-rule",
          ].join(" ")}
          aria-hidden="true"
        >
          {number.toString().padStart(2, "0")}
        </span>

        {/* Sonar ring on active filled marker */}
        {isActive && filled && (
          <span
            className="absolute inset-0 -m-[3px] border border-signal-red pointer-events-none"
            style={{ animation: "sonar-square 2.4s ease-out infinite" }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Label + timestamp */}
      <div className="flex flex-col md:items-center md:text-center md:mt-3 md:px-2 min-w-0 pb-3 md:pb-0">
        <span
          className={[
            "font-display text-base md:text-sm leading-tight whitespace-nowrap",
            filled ? "text-ink" : "text-ink-fade",
            isActive ? "italic" : "",
          ].join(" ")}
        >
          {label}
        </span>
        {timestamp ? (
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-1 whitespace-nowrap">
            {timestamp}
          </span>
        ) : (
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-fade mt-1">
            —
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================
   CONNECTOR
   ============================================
   Sits BETWEEN two stages.

   Mobile (vertical layout): a vertical line aligned with the marker centers
   above and below. Width matches marker width (w-7=28px) so the line aligns
   at the marker's horizontal center (left-1/2). Padding-y on the inner line
   creates the gap so it doesn't touch the marker boxes.

   Desktop (horizontal layout): a horizontal line at the marker's vertical
   center. flex-1 so it fills the gap between stages. mx-3 on the inner line
   creates the gap so it doesn't touch either marker.
   ============================================ */
function Connector({ filled }: { filled: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={[
        // Mobile (vertical): connector occupies a tiny row, aligned to marker column (28px wide)
        "w-7 h-5 flex justify-center items-stretch",
        // Desktop (horizontal): connector becomes a flex-1 row, aligned to marker vertical center (14px from top)
        "md:w-auto md:h-7 md:flex-1 md:flex-shrink md:items-center md:justify-stretch",
      ].join(" ")}
    >
      <span
        className={[
          // Mobile: vertical line — w-px tall, with my-0.5 gap from markers above/below (~2px each end)
          "w-px h-full my-0.5",
          // Desktop: horizontal line — h-px wide, with mx-0.5 gap from markers left/right (~2px each end)
          "md:h-px md:w-full md:my-0 md:mx-0.5",
          filled ? "bg-ink" : "bg-rule",
        ].join(" ")}
      />
    </div>
  );
}
