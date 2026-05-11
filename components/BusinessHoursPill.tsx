"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAdminSettings,
  useAdminStatus,
} from "@/lib/realtime/use-admin-status";
import type { Availability, WeeklyHours } from "@/lib/availability";

const WEEKDAY_ORDER: Array<{ key: keyof WeeklyHours; label: string }> = [
  { key: "1", label: "Mon" },
  { key: "2", label: "Tue" },
  { key: "3", label: "Wed" },
  { key: "4", label: "Thu" },
  { key: "5", label: "Fri" },
  { key: "6", label: "Sat" },
  { key: "0", label: "Sun" },
];

const WEEKDAY_FROM_INTL: Record<string, keyof WeeklyHours> = {
  Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6",
};

function fmt12h(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatRange(open: string | undefined, close: string | undefined): string {
  if (!open || !close) return "—";
  return `${fmt12h(open)} – ${fmt12h(close)}`;
}

function getZonedDayKey(date: Date, tz: string): keyof WeeklyHours {
  const wk = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .format(date);
  return WEEKDAY_FROM_INTL[wk] ?? "0";
}

function getZonedYmd(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${mo}-${d}`;
}

function getTzAbbrev(date: Date, tz: string): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, timeZoneName: "short",
  }).formatToParts(date).find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

function statusDotClass(state: Availability["state"]): string {
  switch (state) {
    case "online": return "bg-emerald-500";
    case "available": return "bg-amber-500";
    case "ooo": return "bg-signal-red";
    case "offline":
    default: return "bg-ink-fade";
  }
}

function statusShort(state: Availability["state"]): string {
  switch (state) {
    case "online": return "Online";
    case "available": return "Available";
    case "ooo": return "Out of office";
    case "offline":
    default: return "Offline";
  }
}

export function BusinessHoursPill() {
  const status = useAdminStatus();
  const settings = useAdminSettings();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside-click and Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Mount on open; unmount happens after the fade-out via onTransitionEnd.
  useEffect(() => {
    if (open) setMounted(true);
    else setVisible(false);
  }, [open]);

  // After mount commits + paints, double-rAF before flipping visible so the
  // browser registers the closed-state styles as the transition's starting
  // frame. A single rAF inside the same effect that sets `mounted` can fire
  // before paint and skip the entry animation entirely.
  useEffect(() => {
    if (!mounted || !open) return;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      if (id2) cancelAnimationFrame(id2);
    };
  }, [mounted, open]);

  if (!status || !settings) return null;

  const now = new Date();
  const todayKey = getZonedDayKey(now, settings.timezone);
  const todayYmd = getZonedYmd(now, settings.timezone);
  const isHoliday = settings.holidays.includes(todayYmd);
  const todayHours = settings.hours[todayKey];
  const tzAbbrev = getTzAbbrev(now, settings.timezone);

  // Inline secondary text — what shows after the status label.
  // When OOO and there's no custom message, we leave this blank so the pill
  // doesn't read "OUT OF OFFICE · OUT OF OFFICE".
  // When out-of-town we mirror the chat widget's "back May 13" so the pill
  // doesn't contradict itself with "OFFLINE · Today 9 AM – 5 PM ET" while
  // the admin is actually away.
  let inlineDetail: string;
  if (status.state === "ooo") {
    inlineDetail = status.detail || "";
  } else if (settings.outOfTown) {
    inlineDetail = status.detail;
  } else if (isHoliday) {
    inlineDetail = "Closed today (holiday)";
  } else if (!todayHours?.enabled) {
    inlineDetail = "Closed today";
  } else {
    inlineDetail = `Today ${formatRange(todayHours.open, todayHours.close)} ${tzAbbrev}`;
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Business hours"
        className="inline-flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-parchment-deep/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red/60 transition-colors"
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${statusDotClass(status.state)} ${
            status.state === "online" ? "animate-pulse" : ""
          }`}
          aria-hidden="true"
        />
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          {statusShort(status.state)}
        </span>
        {inlineDetail && (
          <>
            <span
              aria-hidden="true"
              className="hidden md:inline font-mono text-[0.6rem] tracking-wider text-ink-fade"
            >
              ·
            </span>
            <span className="hidden md:inline font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute truncate max-w-[24ch]">
              {inlineDetail}
            </span>
          </>
        )}
        <svg
          aria-hidden="true"
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className={`text-ink-fade transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && (
        <div
          role="dialog"
          aria-label="Business hours"
          onTransitionEnd={(e) => {
            if (!open && e.propertyName === "opacity") setMounted(false);
          }}
          className={`absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] origin-top-right border border-rule bg-parchment-warm shadow-[0_14px_40px_-18px_rgba(15,15,15,0.35)] transition ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            visible
              ? "opacity-100 translate-y-0 scale-100 duration-[340ms]"
              : "opacity-0 -translate-y-2 scale-[0.96] pointer-events-none duration-[200ms]"
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-rule-soft">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink">
              Business Hours
            </span>
            <span className="ml-auto font-mono text-[0.55rem] tracking-wider text-ink-mute">
              {tzAbbrev}
            </span>
          </div>

          {status.state === "ooo" && (
            <div className="px-3 py-2 border-b border-rule-soft bg-signal-red/5">
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red mb-1">
                Out of office
              </p>
              <p className="font-display italic text-sm text-ink leading-snug">
                {status.detail || "Currently away."}
              </p>
            </div>
          )}

          <ul className="divide-y divide-rule-soft">
            {WEEKDAY_ORDER.map(({ key, label }) => {
              const day = settings.hours[key];
              const isToday = key === todayKey;
              return (
                <li
                  key={key}
                  className={`flex items-center px-3 py-1.5 ${
                    isToday ? "bg-parchment-deep/30" : ""
                  }`}
                >
                  <span
                    className={`font-mono text-[0.65rem] uppercase tracking-widest w-10 ${
                      isToday ? "text-signal-red" : "text-ink-mute"
                    }`}
                  >
                    {label}
                  </span>
                  <span
                    className={`font-mono text-[0.7rem] ml-auto ${
                      day?.enabled ? "text-ink" : "text-ink-fade italic"
                    }`}
                  >
                    {day?.enabled ? formatRange(day.open, day.close) : "closed"}
                  </span>
                </li>
              );
            })}
          </ul>

          {isHoliday && (
            <div className="px-3 py-2 border-t border-rule-soft">
              <p className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute">
                Today is a holiday — closed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
