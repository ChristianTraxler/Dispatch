import type { FreeWindowStatus } from "@/lib/free-updates";

export function FreeWindowStatusLabel({
  status,
}: {
  status: FreeWindowStatus | undefined;
}) {
  if (!status || status.state === "not_in_production") {
    return (
      <div className="font-mono text-[0.8125rem] text-ink-mute">
        Not in production
      </div>
    );
  }
  if (status.state === "active") {
    return (
      <div className="font-mono text-[0.8125rem] text-signal-green">
        Live · {status.daysRemaining} day{status.daysRemaining === 1 ? "" : "s"} of
        free updates remaining
      </div>
    );
  }
  return (
    <div className="font-mono text-[0.8125rem] text-accent">
      Free-updates window expired {status.daysSinceExpired} day
      {status.daysSinceExpired === 1 ? "" : "s"} ago
    </div>
  );
}
