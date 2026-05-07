"use client";

import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import type { Availability } from "@/lib/availability";
import { PullToRefresh } from "./PullToRefresh";

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface PortalShellProps {
  /** Currently signed-in client */
  user: PortalUser;
  /**
   * Live admin availability (online / available / ooo / offline). Pass null
   * while it's still loading; the header will hide the indicator until ready.
   */
  adminStatus?: Availability | null;
  /** Active nav item key */
  activeNav?: "dashboard" | "sites" | "account";
  /** Click handler for nav items — in production these are <Link> hrefs */
  onNavigate?: (target: "dashboard" | "sites" | "account" | "logout" | "new-ticket") => void;
  children: ReactNode;
}

const NAV_ITEMS: { key: "dashboard" | "sites" | "account"; label: string }[] = [
  { key: "dashboard", label: "Tickets" },
  { key: "sites", label: "Sites" },
  { key: "account", label: "Account" },
];

function statusDotClass(state: Availability["state"]): string {
  switch (state) {
    case "online":
      return "bg-emerald-500";
    case "available":
      return "bg-amber-500";
    case "ooo":
      return "bg-signal-red";
    case "offline":
    default:
      return "bg-ink-fade";
  }
}

function statusLabel(state: Availability["state"]): string {
  switch (state) {
    case "online":
      return "Admin online";
    case "available":
      return "Admin available";
    case "ooo":
      return "Out of office";
    case "offline":
    default:
      return "Admin offline";
  }
}

export function PortalShell({
  user,
  adminStatus,
  activeNav = "dashboard",
  onNavigate,
  children,
}: PortalShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Masthead
        compact
        rightContent={
          <div className="flex items-center gap-4">
            {adminStatus && (
              <span
                className="hidden md:inline-flex items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${statusDotClass(adminStatus.state)} ${
                    adminStatus.state === "online" ? "animate-pulse" : ""
                  }`}
                  aria-hidden="true"
                />
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                  {statusLabel(adminStatus.state)}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => onNavigate?.("logout")}
              className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
            >
              Sign out →
            </button>
          </div>
        }
      />

      {/* Sub-nav: account row + nav links */}
      <div className="rule-thin bg-parchment-warm">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Greeting */}
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              Account
            </span>
            <span className="text-ink-fade">·</span>
            <span className="font-display text-base text-ink truncate">{user.name}</span>
            <span className="font-mono text-[0.6rem] tracking-wider text-ink-mute hidden md:inline truncate">
              {user.email}
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-4 md:gap-6 -mx-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate?.(item.key)}
                className={[
                  "font-mono text-[0.65rem] uppercase tracking-widest pb-1 transition-colors whitespace-nowrap",
                  activeNav === item.key
                    ? "text-ink border-b-2 border-signal-red"
                    : "text-ink-mute hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onNavigate?.("new-ticket")}
              className="btn-dispatch ml-auto md:ml-2"
            >
              + New Ticket
            </button>
          </nav>
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1">
        <PullToRefresh>{children}</PullToRefresh>
      </main>
    </div>
  );
}
