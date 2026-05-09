"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { computeAvailability, type WeeklyHours } from "@/lib/availability";
import { VacationCalendar, type Vacation } from "./vacation-calendar";

interface InitialState {
  timezone: string;
  hours: WeeklyHours;
  oooEnabled: boolean;
  oooFromIso: string;  // raw ISO timestamp or ""
  oooUntilIso: string; // raw ISO timestamp or ""
  oooMessage: string;
  holidays: string[];
  emergencyFeeCents: number;
  outOfTown: boolean;
  vacations: Vacation[];
}

const WEEKDAY_LABELS: Array<[keyof WeeklyHours, string]> = [
  ["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"],
  ["5", "Fri"], ["6", "Sat"], ["0", "Sun"],
];

const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "UTC",
];

// Derive YYYY-MM-DD and HH:mm in the browser's local timezone from a UTC ISO.
// Surface "" for the time when it equals the helper's "default" sentinel
// (00:00 for starts, 23:59 for ends) so the placeholder shows in the input.
type TimeKind = "start" | "end";

function deriveDateTime(iso: string, kind: TimeKind): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const isDefault =
    (kind === "start" && hh === "00" && mi === "00") ||
    (kind === "end" && hh === "23" && mi === "59");
  const time = isDefault ? "" : `${hh}:${mi}`;
  return { date: `${yyyy}-${mm}-${dd}`, time };
}

function buildLocalIso(date: string, time: string, kind: TimeKind): string | null {
  if (!date) return null;
  const fallback = kind === "start" ? "00:00:00" : "23:59:59";
  const localTime = time ? `${time}:00` : fallback;
  const d = new Date(`${date}T${localTime}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function AccountForm({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const { push: pushToast } = useToast();

  const initialFrom = deriveDateTime(initial.oooFromIso, "start");
  const initialUntil = deriveDateTime(initial.oooUntilIso, "end");

  const [hours, setHours] = useState<WeeklyHours>(initial.hours);
  const [timezone, setTimezone] = useState<string>(initial.timezone);
  const [oooEnabled, setOooEnabled] = useState<boolean>(initial.oooEnabled);
  const [oooFrom, setOooFrom] = useState<string>(initialFrom.date);
  const [oooFromTime, setOooFromTime] = useState<string>(initialFrom.time);
  const [oooUntil, setOooUntil] = useState<string>(initialUntil.date);
  const [oooUntilTime, setOooUntilTime] = useState<string>(initialUntil.time);
  const [oooMessage, setOooMessage] = useState<string>(initial.oooMessage);
  const [outOfTown, setOutOfTown] = useState<boolean>(initial.outOfTown);

  const [savingHours, setSavingHours] = useState(false);
  const [savingOoo, setSavingOoo] = useState(false);
  const [savingOutOfTown, setSavingOutOfTown] = useState(false);

  const [holidays, setHolidays] = useState<string[]>(initial.holidays);
  const [feeDollars, setFeeDollars] = useState<string>(
    (initial.emergencyFeeCents / 100).toFixed(0),
  );
  const [savingHolidays, setSavingHolidays] = useState(false);
  const [savingFee, setSavingFee] = useState(false);

  // Live preview using current edits, computed against right-now.
  const preview = useMemo(() => {
    const fromIso = buildLocalIso(oooFrom, oooFromTime, "start");
    const cutoffIso = buildLocalIso(oooUntil, oooUntilTime, "end");
    return computeAvailability(
      {
        timezone,
        hours,
        oooEnabled,
        oooFrom: fromIso ? new Date(fromIso) : null,
        oooUntil: cutoffIso ? new Date(cutoffIso) : null,
        oooMessage: oooMessage || null,
        holidays,
      },
      false,
      new Date(),
    );
  }, [timezone, hours, oooEnabled, oooFrom, oooFromTime, oooUntil, oooUntilTime, oooMessage, holidays]);

  async function saveHours() {
    setSavingHours(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone, hours }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Save failed", detail: data.error ?? "Couldn't save hours." });
        return;
      }
      pushToast({ kind: "info", title: "Hours saved" });
      router.refresh();
    } finally {
      setSavingHours(false);
    }
  }

  async function saveOoo() {
    setSavingOoo(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          oooEnabled,
          oooFrom: buildLocalIso(oooFrom, oooFromTime, "start"),
          oooUntil: buildLocalIso(oooUntil, oooUntilTime, "end"),
          oooMessage: oooMessage.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Save failed", detail: data.error ?? "Couldn't save OOO." });
        return;
      }
      pushToast({ kind: "info", title: oooEnabled ? "Out Of Office On" : "Out Of Office Off" });
      router.refresh();
    } finally {
      setSavingOoo(false);
    }
  }

  async function saveOutOfTown() {
    setSavingOutOfTown(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outOfTown }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Save failed", detail: data.error ?? "Couldn't save out-of-town." });
        return;
      }
      pushToast({ kind: "info", title: outOfTown ? "Out of town is ON" : "Out of town is off" });
      router.refresh();
    } finally {
      setSavingOutOfTown(false);
    }
  }

  async function saveHolidays() {
    setSavingHolidays(true);
    try {
      const cleaned = Array.from(
        new Set(holidays.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))),
      ).sort();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holidays: cleaned }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Save failed", detail: data.error ?? "Couldn't save holidays." });
        return;
      }
      setHolidays(cleaned);
      pushToast({ kind: "info", title: "Holidays saved" });
      router.refresh();
    } finally {
      setSavingHolidays(false);
    }
  }

  async function saveFee() {
    setSavingFee(true);
    try {
      const dollars = Number(feeDollars);
      if (!Number.isFinite(dollars) || dollars < 0 || !Number.isInteger(dollars)) {
        pushToast({ kind: "error", title: "Invalid fee", detail: "Whole dollars only, not negative." });
        return;
      }
      const cents = dollars * 100;
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emergencyFeeCents: cents }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Save failed", detail: data.error ?? "Couldn't save fee." });
        return;
      }
      pushToast({ kind: "info", title: "Emergency fee saved" });
      router.refresh();
    } finally {
      setSavingFee(false);
    }
  }

  function setDayEnabled(key: keyof WeeklyHours, enabled: boolean) {
    setHours((h) => ({
      ...h,
      [key]: enabled
        ? { enabled: true, open: h[key].open ?? "09:00", close: h[key].close ?? "17:00" }
        : { enabled: false },
    }));
  }
  function setDayOpen(key: keyof WeeklyHours, open: string) {
    setHours((h) => ({ ...h, [key]: { ...h[key], open } }));
  }
  function setDayClose(key: keyof WeeklyHours, close: string) {
    setHours((h) => ({ ...h, [key]: { ...h[key], close } }));
  }

  const dotColor =
    preview.state === "online" ? "bg-emerald-500"
    : preview.state === "available" ? "bg-amber-500"
    : preview.state === "ooo" ? "bg-signal-red"
    : "bg-ink-fade";

  return (
    <div className="space-y-12">
      {/* Live preview */}
      <section className="border border-rule p-4 bg-parchment-warm">
        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-2">
          Live preview — what customers see right now
        </p>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink">
            {preview.label} — {preview.detail}
          </span>
        </div>
      </section>

      {/* Hours */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            Business Hours
          </span>
          <span className="h-px flex-1 bg-rule-soft" />
          <label className="flex items-center gap-2">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              Timezone
            </span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="font-mono text-[0.7rem] border border-rule bg-parchment px-2 py-1"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>

        <ul className="border border-rule divide-y divide-rule-soft">
          {WEEKDAY_LABELS.map(([key, label]) => {
            const day = hours[key];
            return (
              <li key={key} className="flex items-center gap-4 px-4 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={day.enabled}
                  onClick={() => setDayEnabled(key, !day.enabled)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${
                    day.enabled ? "bg-signal-red" : "bg-ink-fade/40"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-parchment-warm transition-transform ${
                      day.enabled ? "translate-x-4" : ""
                    }`}
                  />
                </button>
                <span className="font-mono text-[0.7rem] uppercase tracking-widest w-10">
                  {label}
                </span>
                {day.enabled ? (
                  <>
                    <input
                      type="time"
                      value={day.open ?? "09:00"}
                      onChange={(e) => setDayOpen(key, e.target.value)}
                      className="font-mono text-sm border border-rule bg-parchment px-2 py-1"
                      aria-label={`${label} open`}
                    />
                    <span className="font-mono text-ink-mute">→</span>
                    <input
                      type="time"
                      value={day.close ?? "17:00"}
                      onChange={(e) => setDayClose(key, e.target.value)}
                      className="font-mono text-sm border border-rule bg-parchment px-2 py-1"
                      aria-label={`${label} close`}
                    />
                  </>
                ) : (
                  <span className="font-display italic text-ink-mute">closed</span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={saveHours}
            disabled={savingHours}
            className="font-mono text-[0.7rem] uppercase tracking-widest border border-signal-red text-signal-red px-4 py-2 hover:bg-signal-red hover:text-parchment-warm transition-colors disabled:opacity-50"
          >
            {savingHours ? "Saving…" : "Save hours"}
          </button>
        </div>
      </section>

      {/* OOO */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            Out of Office
          </span>
          <span className="h-px flex-1 bg-rule-soft" />
        </div>

        <div className="border border-rule p-4 space-y-4">
          <label className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={oooEnabled}
              onClick={() => setOooEnabled((v) => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                oooEnabled ? "bg-signal-red" : "bg-ink-fade/40"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-parchment-warm transition-transform ${
                  oooEnabled ? "translate-x-6" : ""
                }`}
              />
            </button>
            <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink">
              {oooEnabled ? "Out of office is ON" : "Out of office is off"}
            </span>
          </label>

          <div>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute block mb-1">
              Starts on (optional — leave blank to start now; time defaults to start of day)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={oooFrom}
                onChange={(e) => setOooFrom(e.target.value)}
                aria-label="Start date"
                className="font-mono text-sm border border-rule bg-parchment px-2 py-1"
              />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                at
              </span>
              <input
                type="time"
                value={oooFromTime}
                onChange={(e) => setOooFromTime(e.target.value)}
                disabled={!oooFrom}
                aria-label="Start time"
                className="font-mono text-sm border border-rule bg-parchment px-2 py-1 disabled:opacity-50"
              />
              {(oooFrom || oooFromTime) && (
                <button
                  type="button"
                  onClick={() => {
                    setOooFrom("");
                    setOooFromTime("");
                  }}
                  aria-label="Clear start date and time"
                  className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute block mb-1">
              Return on (optional — auto-resumes; time defaults to end of day)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={oooUntil}
                onChange={(e) => setOooUntil(e.target.value)}
                aria-label="Return date"
                className="font-mono text-sm border border-rule bg-parchment px-2 py-1"
              />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                at
              </span>
              <input
                type="time"
                value={oooUntilTime}
                onChange={(e) => setOooUntilTime(e.target.value)}
                disabled={!oooUntil}
                aria-label="Return time"
                className="font-mono text-sm border border-rule bg-parchment px-2 py-1 disabled:opacity-50"
              />
              {(oooUntil || oooUntilTime) && (
                <button
                  type="button"
                  onClick={() => {
                    setOooUntil("");
                    setOooUntilTime("");
                  }}
                  aria-label="Clear return date and time"
                  className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <label className="block">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute block mb-1">
              Custom message (optional, 280 chars)
            </span>
            <textarea
              value={oooMessage}
              onChange={(e) => setOooMessage(e.target.value.slice(0, 280))}
              maxLength={280}
              rows={2}
              placeholder="On vacation — back Mon May 18."
              className="w-full font-display text-base border border-rule bg-parchment px-3 py-2"
            />
          </label>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={saveOoo}
            disabled={savingOoo}
            className="font-mono text-[0.7rem] uppercase tracking-widest border border-signal-red text-signal-red px-4 py-2 hover:bg-signal-red hover:text-parchment-warm transition-colors disabled:opacity-50"
          >
            {savingOoo ? "Saving…" : "Save OOO"}
          </button>
        </div>
      </section>

      {/* Vacations */}
      <VacationCalendar
        initial={initial.vacations}
        timezone={timezone}
        onActiveVacationCreated={() => setOutOfTown(true)}
      />

      {/* Out of Town (silent — clients see no change) */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            Out of Town
          </span>
          <span className="h-px flex-1 bg-rule-soft" />
        </div>

        <div className="border border-rule p-4 space-y-3">
          <label className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={outOfTown}
              onClick={() => setOutOfTown((v) => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                outOfTown ? "bg-signal-red" : "bg-ink-fade/40"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-parchment-warm transition-transform ${
                  outOfTown ? "translate-x-6" : ""
                }`}
              />
            </button>
            <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink">
              {outOfTown ? "Out of town is ON" : "Out of town is off"}
            </span>
          </label>
          <p className="font-display italic text-ink-mute">
            When on, clients won&rsquo;t see the Emergency Fix option after hours.
            Their portal looks normal &mdash; no indication you&rsquo;re away.
            Use this when traveling.
          </p>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={saveOutOfTown}
            disabled={savingOutOfTown}
            className="font-mono text-[0.7rem] uppercase tracking-widest border border-signal-red text-signal-red px-4 py-2 hover:bg-signal-red hover:text-parchment-warm transition-colors disabled:opacity-50"
          >
            {savingOutOfTown ? "Saving…" : "Save out-of-town"}
          </button>
        </div>
      </section>

      {/* Holidays */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            Holidays
          </span>
          <span className="h-px flex-1 bg-rule-soft" />
        </div>
        <p className="font-display italic text-ink-mute mb-4">
          Days that count as outside business hours, in your timezone.
        </p>

        <div className="border border-rule p-4 space-y-3">
          {holidays.length === 0 ? (
            <p className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-fade">
              No holidays added.
            </p>
          ) : (
            holidays.map((d, i) => (
              <div key={`${d}-${i}`} className="flex items-center gap-3">
                <input
                  type="date"
                  value={d}
                  onChange={(e) =>
                    setHolidays((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  className="font-mono text-sm border border-rule bg-parchment px-2 py-1"
                  aria-label={`Holiday ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setHolidays((arr) => arr.filter((_, j) => j !== i))}
                  className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-signal-red"
                >
                  Remove
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setHolidays((arr) => [...arr, ""])}
            className="font-mono text-[0.7rem] uppercase tracking-widest border border-rule text-ink-soft px-3 py-1 hover:border-ink"
          >
            + Add holiday
          </button>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={saveHolidays}
            disabled={savingHolidays}
            className="font-mono text-[0.7rem] uppercase tracking-widest border border-signal-red text-signal-red px-4 py-2 hover:bg-signal-red hover:text-parchment-warm transition-colors disabled:opacity-50"
          >
            {savingHolidays ? "Saving…" : "Save holidays"}
          </button>
        </div>
      </section>

      {/* Emergency Fee */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">§</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            Emergency Fee
          </span>
          <span className="h-px flex-1 bg-rule-soft" />
        </div>
        <p className="font-display italic text-ink-mute mb-4">
          Charged when a client opts into Emergency Fix outside business hours.
        </p>

        <div className="border border-rule p-4 flex items-center gap-3">
          <span className="font-display text-2xl text-ink">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={feeDollars}
            onChange={(e) => setFeeDollars(e.target.value)}
            className="font-mono text-lg border border-rule bg-parchment px-2 py-1 w-28"
            aria-label="Emergency fee in dollars"
          />
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-mute">
            per emergency filing
          </span>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={saveFee}
            disabled={savingFee}
            className="font-mono text-[0.7rem] uppercase tracking-widest border border-signal-red text-signal-red px-4 py-2 hover:bg-signal-red hover:text-parchment-warm transition-colors disabled:opacity-50"
          >
            {savingFee ? "Saving…" : "Save fee"}
          </button>
        </div>
      </section>
    </div>
  );
}
