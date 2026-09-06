"use client";

import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import { PresenceDot } from "./PresenceDot";
import { PullToRefresh } from "./PullToRefresh";
import { ThemeToggle } from "./ThemeToggle";

export interface AdminShellProps {
  /** Active nav item key */
  activeNav?: "dashboard" | "inquiries" | "clients" | "invites" | "add-ons" | "account";
  /** How many clients are currently online (drives the live count badge) */
  onlineClientCount?: number;
  /** Active-inquiry count badge on the Inquiries nav item */
  inquiryCount?: number;
  /** Click handler for nav items */
  onNavigate?: (target: "dashboard" | "inquiries" | "clients" | "invites" | "add-ons" | "account" | "logout") => void;
  children: ReactNode;
}

const ADMIN_NAV: { key: "dashboard" | "inquiries" | "clients" | "invites" | "add-ons"; label: string }[] = [
  { key: "dashboard", label: "Live Ledger" },
  { key: "inquiries", label: "Inquiries" },
  { key: "clients", label: "Clients" },
  { key: "invites", label: "Invites" },
  { key: "add-ons", label: "Add-Ons" },
];

function LiveCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <PresenceDot status={count > 0 ? "online" : "offline"} pulse={count > 0} />
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
        {count} live
      </span>
    </span>
  );
}

export function AdminShell({
  activeNav = "dashboard",
  onlineClientCount = 0,
  inquiryCount = 0,
  onNavigate,
  children,
}: AdminShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Masthead
        compact
        tagline="THE EDITORIAL DESK ── ADMIN VIEW"
        rightContent={
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3 md:gap-4">
              <span className="hidden md:inline-flex items-center gap-4">
                <ThemeToggle />
                <LiveCount count={onlineClientCount} />
              </span>
              <button
                type="button"
                onClick={() => onNavigate?.("account")}
                className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
              >
                Account →
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.("logout")}
                className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
              >
                Sign out →
              </button>
            </div>
            {/* On a phone the top row only has space for the two links —
                keeping these there wrapped the dateline onto a second line —
                so they drop to their own line under "Sign out". */}
            <span className="md:hidden inline-flex items-center gap-3">
              <ThemeToggle />
              <LiveCount count={onlineClientCount} />
            </span>
          </div>
        }
      />

      {/* Sub-nav bar — distinct admin styling: dark band */}
      <div className="bg-band text-onInverse">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-3 md:py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
          <div className="flex items-baseline justify-center md:justify-start gap-2 min-w-0">
            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red">
              ADMIN
            </span>
            <span className="text-onInverse/40">·</span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-onInverse/70 truncate">
              Christian / Developer of Code
            </span>
          </div>

          <nav className="flex items-center justify-start gap-3 md:gap-5 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
            {ADMIN_NAV.map((item, idx) => (
              <span key={item.key} className="flex items-center gap-3 md:gap-5">
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    className="text-onInverse/40 font-mono text-[0.6rem] md:pb-0.5 self-stretch flex items-center leading-none"
                  >
                    •
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate?.(item.key)}
                  className={[
                    "font-mono text-[0.6rem] uppercase tracking-widest py-3 md:py-0 md:pb-0.5 transition-colors whitespace-nowrap",
                    activeNav === item.key
                      ? "text-onInverse border-b-2 border-signal-red"
                      : "text-onInverse/60 hover:text-onInverse",
                  ].join(" ")}
                >
                  {item.label}
                  {item.key === "inquiries" && inquiryCount > 0 && (
                    <span className="ml-1.5 inline-block min-w-[1.1rem] px-1 py-px text-center bg-signal-red text-onInverse font-mono text-[0.55rem] leading-none">
                      {inquiryCount}
                    </span>
                  )}
                </button>
              </span>
            ))}
          </nav>
        </div>
      </div>

      <main className="flex-1">
        <PullToRefresh>{children}</PullToRefresh>
      </main>
    </div>
  );
}
