"use client";

import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import { PresenceDot } from "./PresenceDot";

export interface AdminShellProps {
  /** Active nav item key */
  activeNav?: "dashboard" | "clients" | "invites";
  /** How many clients are currently online (drives the live count badge) */
  onlineClientCount?: number;
  /** Click handler for nav items */
  onNavigate?: (target: "dashboard" | "clients" | "invites" | "logout") => void;
  children: ReactNode;
}

const ADMIN_NAV: { key: "dashboard" | "clients" | "invites"; label: string }[] = [
  { key: "dashboard", label: "Live Ledger" },
  { key: "clients", label: "Clients" },
  { key: "invites", label: "Invites" },
];

export function AdminShell({
  activeNav = "dashboard",
  onlineClientCount = 0,
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
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red">
              EDITOR
            </span>
            <span className="text-ink-fade">·</span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-parchment-warm/70 truncate">
              Christian / Developer of Code
            </span>
          </div>

          <nav className="flex items-center gap-3 md:gap-5 -mx-1 overflow-x-auto">
            {ADMIN_NAV.map((item) => (
              <button
                key={item.key}
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
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="flex-1">{children}</main>
    </div>
  );
}
