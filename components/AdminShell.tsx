"use client";

import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import { PresenceDot } from "./PresenceDot";
import { PullToRefresh } from "./PullToRefresh";

export interface AdminShellProps {
  /** Active nav item key */
  activeNav?: "dashboard" | "inquiries" | "clients" | "invites" | "account";
  /** How many clients are currently online (drives the live count badge) */
  onlineClientCount?: number;
  /** Active-inquiry count badge on the Inquiries nav item */
  inquiryCount?: number;
  /** Click handler for nav items */
  onNavigate?: (target: "dashboard" | "inquiries" | "clients" | "invites" | "account" | "logout") => void;
  children: ReactNode;
}

const ADMIN_NAV: { key: "dashboard" | "inquiries" | "clients" | "invites"; label: string }[] = [
  { key: "dashboard", label: "Live Ledger" },
  { key: "inquiries", label: "Inquiries" },
  { key: "clients", label: "Clients" },
  { key: "invites", label: "Invites" },
];

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
          <div className="flex items-center gap-4">
            <span className="hidden md:inline-flex items-center gap-2">
              <PresenceDot status={onlineClientCount > 0 ? "online" : "offline"} pulse={onlineClientCount > 0} />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                {onlineClientCount} live
              </span>
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
        }
      />

      {/* Sub-nav bar — distinct admin styling: dark band */}
      <div className="bg-ink text-parchment-warm">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
          <div className="flex items-baseline justify-center md:justify-start gap-2 min-w-0">
            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red">
              ADMIN
            </span>
            <span className="text-ink-fade">·</span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-parchment-warm/70 truncate">
              Christian / Developer of Code
            </span>
          </div>

          <nav className="flex items-center justify-center md:justify-start gap-3 md:gap-5 -mx-1 overflow-x-auto">
            {ADMIN_NAV.map((item, idx) => (
              <span key={item.key} className="flex items-center gap-3 md:gap-5">
                {idx > 0 && (
                  <span
                    aria-hidden="true"
                    className="text-ink-fade font-mono text-[0.6rem] pb-0.5 self-stretch flex items-center leading-none"
                  >
                    •
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate?.(item.key)}
                  className={[
                    "font-mono text-[0.6rem] uppercase tracking-widest pb-0.5 transition-colors whitespace-nowrap",
                    activeNav === item.key
                      ? "text-parchment-warm border-b-2 border-signal-red"
                      : "text-parchment-warm/60 hover:text-parchment-warm",
                  ].join(" ")}
                >
                  {item.label}
                  {item.key === "inquiries" && inquiryCount > 0 && (
                    <span className="ml-1.5 inline-block min-w-[1.1rem] px-1 py-px text-center bg-signal-red text-parchment-warm font-mono text-[0.55rem] leading-none">
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
