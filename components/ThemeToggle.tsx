"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getServerThemeMode,
  nextThemeMode,
  readThemeMode,
  setThemeMode,
  subscribeThemeMode,
  THEME_LABEL,
  type ThemeMode,
} from "@/lib/theme";

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 13,
    height: 13,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (mode === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/**
 * Three-state theme control: System → Light → Dark → System.
 *
 * Keeping an explicit "System" position is the point of the cycle — a plain
 * light/dark switch can never hand control back to the OS once it is clicked.
 *
 * The server has no way to know the stored preference, so the first paint of
 * this control always says "System". The page itself is already themed
 * correctly by then (the init script in the root layout runs before paint);
 * only this label is briefly unresolved, so it fades in rather than visibly
 * flipping.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // localStorage is an external store, so it is subscribed to rather than
  // mirrored into state — which also keeps a second tab in step for free.
  const mode = useSyncExternalStore(
    subscribeThemeMode,
    readThemeMode,
    getServerThemeMode,
  );

  const cycle = useCallback(() => {
    setThemeMode(nextThemeMode(readThemeMode()));
  }, []);

  const label = THEME_LABEL[mode];
  const upcoming = THEME_LABEL[nextThemeMode(mode)];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${label}. Switch to ${upcoming}.`}
      title={`Theme: ${label} — click for ${upcoming}`}
      className={`inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal-red focus-visible:ring-offset-2 focus-visible:ring-offset-parchment ${className}`}
    >
      <span className="theme-toggle-in inline-flex items-center gap-1.5">
        <ThemeIcon mode={mode} />
        {/* Fixed width so cycling between the three labels never nudges the
            masthead row sideways. */}
        <span className="hidden sm:inline-block min-w-[3.1rem] text-left">{label}</span>
      </span>
    </button>
  );
}
