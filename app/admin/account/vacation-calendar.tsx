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
    // Already had a range, clicking a new day starts over.
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
    const target = vacations.find((v) => v.id === id);
    if (!target) return;
    const isActive = target.startDate <= today && today <= target.endDate;
    const otherActive = vacations.some(
      (v) => v.id !== id && v.startDate <= today && today <= v.endDate,
    );
    const labelText = target.label?.trim() || "this vacation";
    const dateText = formatDateRange(target.startDate, target.endDate);
    const willFlipOff = isActive && !otherActive;
    const message = willFlipOff
      ? `Remove ${labelText} (${dateText})? Out-of-Town will turn off.`
      : `Remove ${labelText} (${dateText})?`;
    if (!window.confirm(message)) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/vacations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Couldn't delete", detail: (data as { error?: string }).error ?? "Unknown error." });
        return;
      }
      // Mirror the server-side maybe-flip-off: when we know the deletion just
      // turned off Out-of-Town, inform the parent so the toggle follows.
      if (willFlipOff) onOutOfTownChange?.(false);
      setVacations((arr) => arr.filter((v) => v.id !== id));
      pushToast({ kind: "info", title: "Vacation removed" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section id="scheduled-vacations" className="dk-asect">
      <h2 className="dk-h2">Scheduled Vacations</h2>
      <p className="dk-lede">
        Pick the days you&rsquo;ll be away. Out-of-Town flips on automatically at midnight on the start day, and off the day after the last day.
      </p>

      <div className="dk-card dk-cal mt-4">
        {/* Window controls */}
        <div className="dk-calnav">
          <button
            type="button"
            onClick={() => setWindowStart(monthBefore(windowStart))}
            aria-label="Previous month"
          >
            ‹ prev
          </button>
          <span>{labelMonth(month1)}  /  {labelMonth(month2)}</span>
          <button
            type="button"
            onClick={() => setWindowStart(monthAfter(windowStart))}
            aria-label="Next month"
          >
            next ›
          </button>
        </div>

        {/* Two months side-by-side ≥ md, stacked < md */}
        <div className="dk-months">
          <MonthGrid
            ymTitle={labelMonth(month1)}
            grid={buildMonthGrid(month1.y, month1.m, today)}
            scheduledRanges={ranges}
            previewRange={previewRange}
            pendingStart={pendingStart}
            pendingEnd={pendingEnd}
            onDayClick={handleDayClick}
            onDayHover={setHoveredDay}
          />
          <MonthGrid
            ymTitle={labelMonth(month2)}
            grid={buildMonthGrid(month2.y, month2.m, today)}
            scheduledRanges={ranges}
            previewRange={previewRange}
            pendingStart={pendingStart}
            pendingEnd={pendingEnd}
            onDayClick={handleDayClick}
            onDayHover={setHoveredDay}
          />
        </div>

        {/* Selection summary + label + Add */}
        <div className="dk-calfoot">
          <div className="dk-pick">
            {previewRange
              ? `Selected: ${formatDateRange(previewRange.startDate, previewRange.endDate)}`
              : "Click a start day, then an end day."}
          </div>
          <label className="block">
            <span className="dk-flabel block mb-1.5">
              Label (optional, max 80 chars)
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 80))}
              placeholder="Beach trip"
              className="dk-input"
            />
          </label>
          <div className="flex justify-end gap-3">
            {(pendingStart || pendingEnd) && (
              <button
                type="button"
                onClick={clearSelection}
                className="dk-tbtn"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              disabled={!canAdd}
              onClick={addVacation}
              className="dk-btn dk-ghost-signal"
            >
              {adding ? "Saving…" : "Add vacation"}
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming list */}
      <div className="dk-upcoming">
        <div className="dk-flabel mb-2">
          Upcoming
        </div>
        {vacations.length === 0 ? (
          <p className="text-ink-mute">No vacations scheduled.</p>
        ) : (
          <ul className="dk-card dk-list divide-y divide-rule-soft">
            {vacations.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-3 px-5 py-3"
              >
                <span className="font-semibold text-ink flex-1 truncate">
                  {v.label ?? "(no label)"}
                </span>
                <span className="dk-mono text-[0.8125rem] text-ink-mute">
                  {formatDateRange(v.startDate, v.endDate)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteVacation(v.id)}
                  disabled={deletingId === v.id}
                  className="dk-tbtn dk-danger disabled:opacity-50"
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
  pendingStart: string | null;
  pendingEnd: string | null;
  onDayClick: (day: MonthCell) => void;
  onDayHover: (date: string | null) => void;
}

function MonthGrid({
  ymTitle, grid, scheduledRanges, previewRange, pendingStart, pendingEnd, onDayClick, onDayHover,
}: MonthGridProps) {
  const dayHeaders = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div>
      <div className="dk-mtitle">
        {ymTitle}
      </div>
      <div className="dk-grid7">
        {dayHeaders.map((h, i) => (
          <div
            key={i}
            className="dk-wd"
          >
            {h}
          </div>
        ))}
        {grid.flat().map((cell) => {
          const scheduled = isInAnyRange(cell.date, scheduledRanges);
          const inPreview = previewRange && isInAnyRange(cell.date, [previewRange]);
          const disabled = cell.isPast || scheduled;
          const isSelectedEndpoint = cell.date === pendingStart || cell.date === pendingEnd;
          const isRangeEdge =
            !!previewRange &&
            (cell.date === previewRange.startDate || cell.date === previewRange.endDate);
          let cls = "dk-dbtn";
          if (!cell.inMonth) cls += " dk-dim";
          else if (disabled && scheduled) cls += " dk-sched";
          else if (disabled) cls += " dk-past";
          else if (inPreview) cls += isRangeEdge ? " dk-edge" : " dk-inr";
          if (cell.isToday && !inPreview) cls += " dk-istoday";
          return (
            <button
              key={cell.date}
              type="button"
              aria-label={ariaForDay(cell.date)}
              aria-disabled={disabled}
              aria-pressed={isSelectedEndpoint || undefined}
              data-in-range={inPreview ? "true" : undefined}
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
