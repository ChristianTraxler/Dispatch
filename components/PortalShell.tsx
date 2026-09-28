"use client";

import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import { PullToRefresh } from "./PullToRefresh";
import { ThemeToggle } from "./ThemeToggle";

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
   * Optional element rendered in the masthead's right area, before "Sign out".
   * Used by the portal to mount the BusinessHoursPill (status + today's hours
   * + click-to-expand weekly schedule).
   */
  availabilityPill?: ReactNode;
  /** Active nav item key */
  activeNav?: "dashboard" | "sites" | "add-ons" | "account";
  /** Click handler for nav items, in production these are <Link> hrefs */
  onNavigate?: (target: "dashboard" | "sites" | "add-ons" | "account" | "logout" | "new-ticket") => void;
  children: ReactNode;
}

const NAV_ITEMS: { key: "dashboard" | "sites" | "add-ons" | "account"; label: string }[] = [
  { key: "dashboard", label: "Tickets" },
  { key: "sites", label: "Sites" },
  { key: "add-ons", label: "Add-Ons" },
  { key: "account", label: "Account" },
];

export function PortalShell({
  user,
  availabilityPill,
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
            <ThemeToggle />
            {availabilityPill}
            <button
              type="button"
              onClick={() => onNavigate?.("logout")}
              className="font-mono text-[0.8125rem] text-ink-mute hover:text-accent transition-colors"
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
            <span className="font-mono text-[0.8125rem] text-ink-mute">
              Account
            </span>
            <span className="text-ink-fade">·</span>
            <span className="font-display text-base text-ink truncate">{user.name}</span>
            <span className="font-mono text-[0.8125rem] text-ink-mute hidden md:inline truncate">
              {user.email}
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-3 md:gap-6">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate?.(item.key)}
                className={[
                  "font-mono text-[0.8125rem] pb-1 transition-colors whitespace-nowrap",
                  activeNav === item.key
                    ? "text-ink border-b-2 border-accent"
                    : "text-ink-mute hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onNavigate?.("new-ticket")}
              className="btn-dispatch btn-compact whitespace-nowrap w-full md:w-auto md:ml-2"
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
