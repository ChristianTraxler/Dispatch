"use client";

import { type CSSProperties } from "react";

export type PresenceStatus = "online" | "offline";

export interface PresenceDotProps {
  status: PresenceStatus;
  /** Whether the online state pulses. Defaults to true. Set false for static lists. */
  pulse?: boolean;
  /** Show the text label next to the dot. Defaults to false. */
  showLabel?: boolean;
  /** Override the label text (default: "Online" / "Offline") */
  label?: string;
  /** Additional className for the wrapper */
  className?: string;
  style?: CSSProperties;
}

/**
 * Live status indicator. Green sonar pulse when online, solid red dot when offline.
 *
 * @example
 *   <PresenceDot status="online" showLabel />
 *   <PresenceDot status="offline" showLabel label="Away" />
 *   <PresenceDot status="online" pulse={false} />  // static for dense lists
 */
export function PresenceDot({
  status,
  pulse = true,
  showLabel = false,
  label,
  className = "",
  style,
}: PresenceDotProps) {
  const dotClasses = [
    "presence-dot",
    status,
    status === "online" && pulse ? "pulse" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const resolvedLabel = label ?? (status === "online" ? "Online" : "Offline");

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      style={style}
      role="status"
      aria-label={resolvedLabel}
    >
      <span className={dotClasses} aria-hidden="true" />
      {showLabel && (
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-soft">
          {resolvedLabel}
        </span>
      )}
    </span>
  );
}
