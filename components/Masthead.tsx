import { type ReactNode } from "react";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";

export interface MastheadProps {
  /** The dateline shown beneath the wordmark (e.g., "MONDAY, MAY 04, VOL. II, ISSUE 03") */
  dateline?: string;
  /** Tagline shown beneath the masthead */
  tagline?: string;
  /** Optional right-side content (e.g., logout button, presence indicator) */
  rightContent?: ReactNode;
  /** Tighter version for inner pages */
  compact?: boolean;
}

/**
 * Formatted in the desk's zone rather than the runtime's. Read from the local
 * clock this was a hydration bug: Vercel runs UTC, so at 8pm in New York the
 * server rendered SUNDAY and the browser SATURDAY, and React 19 answers a text
 * mismatch by discarding the server-rendered tree and re-rendering the whole
 * page on the client, which recreated <html> and silently dropped the
 * data-theme attribute set before first paint.
 */
function defaultDateline(): string {
  const d = new Date();
  const zone = { timeZone: DISPLAY_TIME_ZONE };
  const dayName = d.toLocaleString("en-US", { ...zone, weekday: "long" });
  const monthDay = d.toLocaleString("en-US", { ...zone, month: "long", day: "numeric" });
  return `${dayName}, ${monthDay}`;
}

export function Masthead({
  dateline,
  tagline = "A support desk for Developer of Code clients",
  rightContent,
  compact = false,
}: MastheadProps) {
  return (
    <header className={`w-full ${compact ? "py-4 md:py-5" : "py-6 md:py-9"} px-5 md:px-10 bg-parchment border-b border-rule-soft`}>
      <div className="max-w-6xl mx-auto">
        {/* Top bar: dateline + right content. Top-aligned on mobile so the
            admin bar's two stacked rows sit level with the dateline. */}
        <div className="flex items-start md:items-center justify-between gap-3 mb-3">
          <span className="font-mono text-[0.8125rem] text-ink-mute">
            {dateline ?? defaultDateline()}
          </span>
          {rightContent && <div className="flex-shrink-0">{rightContent}</div>}
        </div>

        {/* Wordmark, matching the public page */}
        <h1
          className={`wordmark text-ink ${
            compact ? "text-[1.75rem] md:text-[2.25rem]" : "text-[2.5rem] md:text-[3.5rem]"
          }`}
        >
          Dispatch
          <span aria-hidden="true" className="wordmark-dot" />
        </h1>

        {/* Tagline */}
        {!compact && (
          <p className="font-display italic text-ink-mute mt-3 text-base md:text-lg">
            {tagline}
          </p>
        )}
      </div>
    </header>
  );
}
