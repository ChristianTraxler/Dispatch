"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { computeAvailability, type WeeklyHours } from "@/lib/availability";

interface InitialState {
  timezone: string;
  hours: WeeklyHours;
  oooEnabled: boolean;
  oooUntil: string; // YYYY-MM-DD or ""
  oooMessage: string;
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

export function AccountForm({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const { push: pushToast } = useToast();

  const [hours, setHours] = useState<WeeklyHours>(initial.hours);
  const [timezone, setTimezone] = useState<string>(initial.timezone);
  const [oooEnabled, setOooEnabled] = useState<boolean>(initial.oooEnabled);
  const [oooUntil, setOooUntil] = useState<string>(initial.oooUntil);
  const [oooMessage, setOooMessage] = useState<string>(initial.oooMessage);

  const [savingHours, setSavingHours] = useState(false);
  const [savingOoo, setSavingOoo] = useState(false);

  // Live preview using current edits, computed against right-now.
  const preview = useMemo(() => {
    return computeAvailability(
      {
        timezone,
        hours,
        oooEnabled,
        oooUntil: oooUntil ? new Date(oooUntil + "T23:59:59") : null,
        oooMessage: oooMessage || null,
      },
      false,
      new Date(),
    );
  }, [timezone, hours, oooEnabled, oooUntil, oooMessage]);

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
          oooUntil: oooUntil ? new Date(oooUntil + "T23:59:59").toISOString() : null,
          oooMessage: oooMessage.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        pushToast({ kind: "error", title: "Save failed", detail: data.error ?? "Couldn't save OOO." });
        return;
      }
      pushToast({ kind: "info", title: oooEnabled ? "Out of office on" : "Out of office off" });
      router.refresh();
    } finally {
      setSavingOoo(false);
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

          <label className="block">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute block mb-1">
              Return on (optional — auto-resumes)
            </span>
            <input
              type="date"
              value={oooUntil}
              onChange={(e) => setOooUntil(e.target.value)}
              className="font-mono text-sm border border-rule bg-parchment px-2 py-1"
            />
          </label>

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
    </div>
  );
}
