"use client";

import { useAdminStatus } from "@/lib/realtime/use-admin-status";

export function AdminAvailabilityLine({ className = "" }: { className?: string }) {
  const status = useAdminStatus();
  if (!status) return null;

  const dotColor =
    status.state === "online" ? "bg-emerald-500"
    : status.state === "available" ? "bg-amber-500"
    : status.state === "ooo" ? "bg-signal-red"
    : "bg-ink-fade";

  const pulse = status.state === "online";

  // If detail looks like "back {weekday hour:min}", localize using nextOpenAt
  // so a customer in another timezone sees their own clock.
  const detail =
    status.state === "offline" && status.nextOpenAt
      ? `back ${new Date(status.nextOpenAt).toLocaleString(undefined, {
          weekday: "short", hour: "numeric", minute: "2-digit",
        })}`
      : status.detail;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 border-b border-rule-soft bg-parchment-warm/40 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${dotColor} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute truncate">
        {status.label} — {detail}
      </span>
    </div>
  );
}
