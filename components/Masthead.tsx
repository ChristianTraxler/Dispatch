import { type ReactNode } from "react";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";

export interface MastheadProps {
  /** The dateline shown beneath the wordmark (e.g., "MONDAY, MAY 04 — VOL. II, ISSUE 03") */
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
 * page on the client — which recreated <html> and silently dropped the
 * data-theme attribute set before first paint.
 */
function defaultDateline(): string {
  const d = new Date();
  const zone = { timeZone: DISPLAY_TIME_ZONE };
  const dayName = d.toLocaleString("en-US", { ...zone, weekday: "long" }).toUpperCase();
  const monthDay = d
    .toLocaleString("en-US", { ...zone, month: "long", day: "2-digit" })
    .toUpperCase();
  return `${dayName}, ${monthDay}`;
}

export function Masthead({
  dateline,
  tagline = "A SUPPORT DESK FOR DEVELOPER OF CODE CLIENTS",
  rightContent,
  compact = false,
}: MastheadProps) {
  return (
    <header className={`w-full ${compact ? "py-4 md:py-6" : "py-6 md:py-10"} px-5 md:px-10 rule-double bg-parchment`}>
      <div className="max-w-6xl mx-auto">
        {/* Top bar — dateline + right content.
            Top-aligned on mobile: the admin bar stacks its right side onto two
            rows there, and centring would drop the dateline to sit between
            them instead of level with "Account / Sign out". */}
        <div className="flex items-start md:items-center justify-between gap-3 mb-2">
          <span className="font-mono text-[0.6rem] md:text-[0.65rem] uppercase tracking-widest text-ink-mute">
            {dateline ?? defaultDateline()}
          </span>
          {rightContent && <div className="flex-shrink-0">{rightContent}</div>}
        </div>

        {/* Wordmark */}
        <div className="flex items-baseline gap-3 md:gap-5 flex-wrap">
          <h1
            className={`font-display font-light leading-none tracking-tight text-ink ${
              compact ? "text-3xl md:text-5xl" : "text-5xl md:text-7xl"
            }`}
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            DISPATCH
          </h1>
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red whitespace-nowrap">
            ── EST. 2026
          </span>
        </div>

        {/* Tagline */}
        {!compact && (
          <p className="font-display italic text-ink-mute mt-2 text-sm md:text-base">
            {tagline}
          </p>
        )}
      </div>
    </header>
  );
}
