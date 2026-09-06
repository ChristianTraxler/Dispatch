"use client";

import { type ReactNode, useSyncExternalStore } from "react";

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

function defaultDateline(): string {
  const d = new Date();
  const dayName = d.toLocaleString("en-US", { weekday: "long" }).toUpperCase();
  const monthDay = d.toLocaleString("en-US", { month: "long", day: "2-digit" }).toUpperCase();
  return `${dayName}, ${monthDay}`;
}

/**
 * The dateline is read through useSyncExternalStore rather than computed
 * inline, because the server and the reader are rarely in the same timezone:
 * Vercel runs UTC, so at 8pm in New York the server says Sunday and the
 * browser says Saturday.
 *
 * Rendered inline that text mismatch is a hydration error, and React 19
 * recovers from those by throwing away the server-rendered tree and
 * re-rendering the whole page on the client — which recreates <html> and
 * silently drops the theme attribute set before first paint. Reading it as an
 * external store makes the difference expected instead of an error: hydration
 * uses the server snapshot, then React re-renders with the reader's own date.
 *
 * The server snapshot must be a value both sides agree on. It cannot be the
 * date itself: getServerSnapshot runs on the client during hydration, where
 * `new Date()` yields the reader's date, not the server's — which is the very
 * mismatch we are trying to avoid. So the server reserves the line and the
 * reader's own date fills it in on mount.
 *
 * The date does not change under us mid-session, so there is nothing to
 * subscribe to.
 */
const subscribeToNothing = () => () => {};

/** Non-breaking space: holds the line's height until the real date arrives. */
const RESERVED_DATELINE = "\u00A0";
const getReservedDateline = () => RESERVED_DATELINE;

export function Masthead({
  dateline,
  tagline = "A SUPPORT DESK FOR DEVELOPER OF CODE CLIENTS",
  rightContent,
  compact = false,
}: MastheadProps) {
  const localDateline = useSyncExternalStore(
    subscribeToNothing,
    defaultDateline,
    getReservedDateline,
  );

  return (
    <header className={`w-full ${compact ? "py-4 md:py-6" : "py-6 md:py-10"} px-5 md:px-10 rule-double bg-parchment`}>
      <div className="max-w-6xl mx-auto">
        {/* Top bar — dateline + right content */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="font-mono text-[0.6rem] md:text-[0.65rem] uppercase tracking-widest text-ink-mute">
            {dateline ?? localDateline}
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
