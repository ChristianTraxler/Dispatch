"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  buildMonthGrid,
  formatDateRange,
  isInAnyRange,
  todayInTimezone,
  type DateRange,
  type MonthCell,
} from "@/lib/vacation-helpers";

export interface Vacation {
  id: string;
  label: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

interface Props {
  initial: Vacation[];
  timezone: string;
  /** Fires whenever a vacation save/delete causes the server to flip the
   *  outOfTown flag, so the parent's local toggle reflects reality without
   *  waiting for a reload. */
  onOutOfTownChange?: (value: boolean) => void;
}

export function VacationCalendar({ initial, timezone, onOutOfTownChange }: Props) {
  const router = useRouter();
  const { push: pushToast } = useToast();

  const [vacations, setVacations] = useState<Vacation[]>(initial);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Range selection state.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [pendingEnd, setPendingEnd] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  // Visible window: month1 + month2. Default = current month + next.
  const today = useMemo(() => todayInTimezone(timezone), [timezone]);
  const [year, todayMonth] = today.split("-").map(Number) as [number, number];
  const [windowStart, setWindowStart] = useState<{ y: number; m: number }>({
    y: year,
    m: todayMonth,
  });

  const month1 = windowStart;
  const month2 = monthAfter(month1);

  const ranges: DateRange[] = vacations.map((v) => ({ startDate: v.startDate, endDate: v.endDate }));

  // Effective preview range while picking.
  const previewRange: DateRange | null = (() => {
    if (!pendingStart) return null;
    if (pendingEnd) return order(pendingStart, pendingEnd);
    if (hoveredDay && hoveredDay >= today) return order(pendingStart, hoveredDay);
    return { startDate: pendingStart, endDate: pendingStart };
  })();

  const canAdd = !!previewRange && !!pendingEnd && !adding;

  function handleDayClick(day: MonthCell) {
    if (day.isPast || isInAnyRange(day.date, ranges)) return;
    if (!pendingStart) {
      setPendingStart(day.date);
      setPendingEnd(null);
      return;
    }
    if (!pendingEnd) {
      setPendingEnd(day.date);
      return;
    }
    // Already had a range — clicking a new day starts over.
    setPendingStart(day.date);
    setPendingEnd(null);
  }

  function clearSelection() {
    setPendingStart(null);
    setPendingEnd(null);
    setHoveredDay(null);
  }

  async function addVacation() {
    if (!previewRange || !pendingEnd) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/vacations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || null,
          startDate: previewRange.startDate,
          endDate: previewRange.endDate,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Couldn't add vacation", detail: (data as { error?: string }).error ?? "Unknown error." });
        return;
      }
      const created = (await res.json()) as Vacation;
      setVacations((arr) => [...arr, created].sort((a, b) => a.startDate.localeCompare(b.startDate)));
      // If this vacation includes today, the server flipped outOfTown=true.
      // Notify the parent so its toggle reflects reality without a reload.
      if (created.startDate <= today && today <= created.endDate) {
        onOutOfTownChange?.(true);
      }
      setLabel("");
      clearSelection();
      pushToast({ kind: "info", title: "Vacation added" });
      router.refresh(); // re-pulls server-rendered state (and updates outOfTown if it flipped)
    } finally {
      setAdding(false);
    }
  }

  async function deleteVacation(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/vacations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Couldn't delete", detail: (data as { error?: string }).error ?? "Unknown error." });
        return;
      }
      // Mirror the server-side maybe-flip-off: if the deleted vacation was
      // currently active AND no OTHER vacation is currently active, the server
      // flipped outOfTown=false. Inform the parent so the toggle follows.
      const target = vacations.find((v) => v.id === id);
      if (target && target.startDate <= today && today <= target.endDate) {
        const otherActive = vacations.some(
          (v) => v.id !== id && v.startDate <= today && today <= v.endDate,
        );
        if (!otherActive) onOutOfTownChange?.(false);
      }
      setVacations((arr) => arr.filter((v) => v.id !== id));
      pushToast({ kind: "info", title: "Vacation removed" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Scheduled Vacations
        </span>
        <span className="h-px flex-1 bg-rule-soft" />
      </div>
      <p className="font-display italic text-ink-mute mb-4">
        Pick the days you&rsquo;ll be away. Out-of-Town flips on automatically at midnight on the start day, and off the day after the last day.
      </p>

      <div className="border border-rule p-4 space-y-6">
        {/* Window controls */}
        <div className="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          <button
            type="button"
            onClick={() => setWindowStart(monthBefore(windowStart))}
            className="hover:text-signal-red transition-colors"
            aria-label="Previous month"
          >
            ‹ prev
          </button>
          <span>{labelMonth(month1)}  /  {labelMonth(month2)}</span>
          <button
            type="button"
            onClick={() => setWindowStart(monthAfter(windowStart))}
            className="hover:text-signal-red transition-colors"
            aria-label="Next month"
          >
            next ›
          </button>
        </div>

        {/* Two months side-by-side ≥ md, stacked < md */}
        <div className="grid gap-6 md:grid-cols-2">
          <MonthGrid
            ymTitle={labelMonth(month1)}
            grid={buildMonthGrid(month1.y, month1.m, today)}
            scheduledRanges={ranges}
            previewRange={previewRange}
            onDayClick={handleDayClick}
            onDayHover={setHoveredDay}
          />
          <MonthGrid
            ymTitle={labelMonth(month2)}
            grid={buildMonthGrid(month2.y, month2.m, today)}
            scheduledRanges={ranges}
            previewRange={previewRange}
            onDayClick={handleDayClick}
            onDayHover={setHoveredDay}
          />
        </div>

        {/* Selection summary + label + Add */}
        <div className="border-t border-rule-soft pt-4 space-y-3">
          <div className="font-mono text-[0.7rem] uppercase tracking-widest text-ink">
            {previewRange
              ? `Selected: ${formatDateRange(previewRange.startDate, previewRange.endDate)}`
              : "Click a start day, then an end day."}
          </div>
          <label className="block">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute block mb-1">
              Label (optional, max 80 chars)
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 80))}
              placeholder="Beach trip"
              className="w-full font-display text-base border border-rule bg-parchment px-3 py-2"
            />
          </label>
          <div className="flex justify-end gap-3">
            {(pendingStart || pendingEnd) && (
              <button
                type="button"
                onClick={clearSelection}
                className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              disabled={!canAdd}
              onClick={addVacation}
              className="font-mono text-[0.7rem] uppercase tracking-widest border border-signal-red text-signal-red px-4 py-2 hover:bg-signal-red hover:text-parchment-warm transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-signal-red"
            >
              {adding ? "Saving…" : "Add vacation"}
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming list */}
      <div className="mt-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-2">
          Upcoming
        </div>
        {vacations.length === 0 ? (
          <p className="font-display italic text-ink-mute">No vacations scheduled.</p>
        ) : (
          <ul className="border border-rule divide-y divide-rule-soft">
            {vacations.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-3 px-4 py-3 bg-parchment-warm/40"
              >
                <span className="font-display italic text-ink flex-1 truncate">
                  {v.label ?? "(no label)"}
                </span>
                <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-mute">
                  {formatDateRange(v.startDate, v.endDate)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteVacation(v.id)}
                  disabled={deletingId === v.id}
                  className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors disabled:opacity-50"
                >
                  {deletingId === v.id ? "Removing…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Single-month subcomponent

interface MonthGridProps {
  ymTitle: string;
  grid: MonthCell[][];
  scheduledRanges: DateRange[];
  previewRange: DateRange | null;
  onDayClick: (day: MonthCell) => void;
  onDayHover: (date: string | null) => void;
}

function MonthGrid({
  ymTitle, grid, scheduledRanges, previewRange, onDayClick, onDayHover,
}: MonthGridProps) {
  const dayHeaders = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div>
      <div className="font-mono text-[0.65rem] uppercase tracking-widest text-ink mb-2 text-center">
        {ymTitle}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dayHeaders.map((h, i) => (
          <div
            key={i}
            className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade text-center pb-1"
          >
            {h}
          </div>
        ))}
        {grid.flat().map((cell) => {
          const scheduled = isInAnyRange(cell.date, scheduledRanges);
          const inPreview = previewRange && isInAnyRange(cell.date, [previewRange]);
          const disabled = cell.isPast || scheduled;
          const base = "h-9 flex items-center justify-center font-mono text-sm rounded-sm transition-colors";
          let cls = base;
          if (!cell.inMonth) cls += " text-ink-fade/40";
          else if (disabled && scheduled) cls += " bg-signal-red/30 text-ink-fade cursor-not-allowed";
          else if (disabled) cls += " text-ink-fade/60 cursor-not-allowed";
          else if (inPreview) cls += " bg-signal-red text-parchment-warm";
          else cls += " text-ink hover:bg-signal-red/10 cursor-pointer";
          if (cell.isToday && !inPreview) cls += " ring-1 ring-signal-red";
          return (
            <button
              key={cell.date}
              type="button"
              aria-label={ariaForDay(cell.date)}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => !disabled && onDayClick(cell)}
              onMouseEnter={() => !disabled && onDayHover(cell.date)}
              onMouseLeave={() => onDayHover(null)}
              onFocus={() => !disabled && onDayHover(cell.date)}
              className={cls}
            >
              {Number(cell.date.split("-")[2])}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// helpers

function order(a: string, b: string): DateRange {
  return a <= b ? { startDate: a, endDate: b } : { startDate: b, endDate: a };
}

function monthAfter({ y, m }: { y: number; m: number }): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}
function monthBefore({ y, m }: { y: number; m: number }): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

function labelMonth({ y, m }: { y: number; m: number }): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${y}`;
}

function ariaForDay(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return fmt.format(dt);
}
