"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { PullToRefresh } from "./PullToRefresh";
import { ThemeIcon, useThemeCycle } from "./ThemeToggle";
import { DISPLAY_TIME_ZONE } from "@/lib/datetime";
import {
  AccountIcon,
  AddOnsIcon,
  ClientsIcon,
  InquiriesIcon,
  InvitesIcon,
  LedgerIcon,
  SignOutIcon,
  UpIcon,
} from "@/app/admin/docket-icons";
// import { StatusFooter } from "./StatusBadge";  // see StatusFooter below

type NavKey = "dashboard" | "inquiries" | "clients" | "invites" | "add-ons" | "account";

export interface AdminShellProps {
  /** Active nav item key */
  activeNav?: NavKey;
  /** How many clients are currently online (drives the live count badge) */
  onlineClientCount?: number;
  /** Active-inquiry count badge on the Inquiries nav item */
  inquiryCount?: number;
  /** Click handler for nav items */
  onNavigate?: (target: NavKey | "logout") => void;
  children: ReactNode;
}

const ADMIN_NAV: {
  key: Exclude<NavKey, "account">;
  label: string;
  Icon: typeof LedgerIcon;
}[] = [
  { key: "dashboard", label: "Live Ledger", Icon: LedgerIcon },
  { key: "inquiries", label: "Inquiries", Icon: InquiriesIcon },
  { key: "clients", label: "Clients", Icon: ClientsIcon },
  { key: "invites", label: "Invites", Icon: InvitesIcon },
  { key: "add-ons", label: "Add-Ons", Icon: AddOnsIcon },
];

// Shown past this scroll depth, per the Docket spec.
const TO_TOP_AFTER_PX = 420;

/**
 * Formatted in the desk's zone, never the runtime's: Vercel runs UTC, and a
 * server/browser mismatch here would trip React's hydration recovery.
 */
function todayLine(): string {
  const d = new Date();
  const zone = { timeZone: DISPLAY_TIME_ZONE };
  const dayName = d.toLocaleString("en-US", { ...zone, weekday: "long" });
  const monthDay = d.toLocaleString("en-US", { ...zone, month: "long", day: "numeric" });
  return `${dayName}, ${monthDay}`;
}

function Wordmark({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="dk-mark" aria-label="Dispatch, Live Ledger">
      Dispatch
      <i aria-hidden="true" />
    </button>
  );
}

function LiveDot({ count }: { count: number }) {
  return <span className={`dk-dot${count > 0 ? " dk-on" : ""}`} aria-hidden="true" />;
}

function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > TO_TOP_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onClick = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to top"
      title="Scroll to top"
      tabIndex={visible ? 0 : -1}
      className={`dk-totop dk-totop-pos${visible ? " dk-show" : ""}`}
    >
      <UpIcon />
    </button>
  );
}

export function AdminShell({
  activeNav = "dashboard",
  onlineClientCount = 0,
  inquiryCount = 0,
  onNavigate,
  children,
}: AdminShellProps) {
  const theme = useThemeCycle();
  const themeTitle = `Theme: ${theme.label}. Switch to ${theme.upcoming}.`;
  const go = (target: NavKey | "logout") => onNavigate?.(target);

  return (
    <div className="dk-app">
      {/* Desktop: the switchboard rail */}
      <aside className="dk-rail" aria-label="Admin">
        <Wordmark onClick={() => go("dashboard")} />
        <div className="dk-who">
          <b>ADMIN</b>
          Christian / Developer of Code
        </div>
        <nav aria-label="Admin sections">
          {ADMIN_NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className="dk-nav"
              aria-current={activeNav === key ? "page" : undefined}
              onClick={() => go(key)}
            >
              <Icon />
              {label}
              {key === "inquiries" && <span className="dk-n">{inquiryCount}</span>}
            </button>
          ))}
        </nav>
        <div className="dk-foot">
          <span className="dk-row dk-live">
            <LiveDot count={onlineClientCount} />
            {onlineClientCount} live
          </span>
          <button
            type="button"
            className="dk-row"
            onClick={theme.cycle}
            aria-label={themeTitle}
            title={themeTitle}
          >
            <span className="dk-themeicon theme-toggle-in">
              <ThemeIcon mode={theme.mode} size={17} />
            </span>
            <span className="theme-toggle-in">{theme.label}</span>
          </button>
          <button
            type="button"
            className="dk-row"
            aria-current={activeNav === "account" ? "page" : undefined}
            onClick={() => go("account")}
          >
            <AccountIcon />
            Account
          </button>
          <button type="button" className="dk-row" onClick={() => go("logout")}>
            <SignOutIcon />
            Sign out
          </button>
        </div>
      </aside>

      {/* Phone: sticky top bar */}
      <header className="dk-topbar">
        <Wordmark onClick={() => go("dashboard")} />
        <span className="dk-grow" />
        <span className="dk-livechip">
          <LiveDot count={onlineClientCount} />
          {onlineClientCount} live
        </span>
        <button
          type="button"
          className="dk-iconbtn"
          onClick={theme.cycle}
          aria-label={themeTitle}
          title={themeTitle}
        >
          <span className="dk-themeicon theme-toggle-in">
            <ThemeIcon mode={theme.mode} size={18} />
          </span>
        </button>
        <button
          type="button"
          className="dk-iconbtn"
          aria-label="Account"
          aria-current={activeNav === "account" ? "page" : undefined}
          onClick={() => go("account")}
        >
          <AccountIcon />
        </button>
        <button
          type="button"
          className="dk-iconbtn"
          aria-label="Sign out"
          onClick={() => go("logout")}
        >
          <SignOutIcon />
        </button>
      </header>

      <main className="dk-main">
        <div className="dk-page">
          <p className="dk-today">{todayLine()}</p>
          <PullToRefresh>
            <div className="dk-enter" key={activeNav}>
              {children}
            </div>
          </PullToRefresh>
        </div>
      </main>

      {/* Phone: bottom tab bar */}
      <nav className="dk-tabbar" aria-label="Admin sections">
        {ADMIN_NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className="dk-nav"
            aria-current={activeNav === key ? "page" : undefined}
            onClick={() => go(key)}
          >
            <span className="dk-tabicon">
              <Icon />
              {key === "inquiries" && inquiryCount > 0 && (
                <span className="dk-tabcount">{inquiryCount}</span>
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>

      <ScrollTopButton />

      {/* Service-status badge, parked, not abandoned.
          Better Stack's free plan allows the custom-domain status page on one
          site only, and developerofcode.com already claims it, so
          status.developerofcode.com doesn't answer for Dispatch and the badge
          would sit permanently grey. Uncomment this and the import above once
          the plan allows a second page. /api/status and StatusBadge.tsx are
          unchanged and still work. */}
      {/* <StatusFooter /> */}
    </div>
  );
}
