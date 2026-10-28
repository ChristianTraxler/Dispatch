"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { computeAvailability, type WeeklyHours } from "@/lib/availability";
import { VacationCalendar, type Vacation } from "./vacation-calendar";
import { Avatar } from "@/components/Avatar";
import PushToggle from "@/components/PushToggle";
import PasskeyManager from "@/components/PasskeyManager";
import { XIcon } from "../docket-icons";

interface InitialState {
  avatarUrl: string | null;
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

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      pushToast({ kind: "error", title: "Profile picture", detail: "PNG, JPG, or WebP only." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast({ kind: "error", title: "Profile picture", detail: "Image must be under 2 MB." });
      return;
    }
    setAvatarBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/account/avatar", { method: "POST", body: fd });
    setAvatarBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      pushToast({ kind: "error", title: "Profile picture", detail: body.error ?? "Upload failed." });
      return;
    }
    const data = (await res.json()) as { avatarUrl: string | null };
    setAvatarUrl(data.avatarUrl);
    pushToast({ kind: "info", title: "Profile picture updated." });
    router.refresh();
  }

  async function onRemoveAvatar() {
    if (!avatarUrl || !confirm("Remove your profile picture?")) return;
    setAvatarBusy(true);
    const res = await fetch("/api/admin/account/avatar", { method: "DELETE" });
    setAvatarBusy(false);
    if (!res.ok) {
      pushToast({ kind: "error", title: "Profile picture", detail: "Could not remove picture." });
      return;
    }
    setAvatarUrl(null);
    pushToast({ kind: "info", title: "Profile picture removed." });
    router.refresh();
  }

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
        // The admin form's preview pane only previews schedule + OOO edits.
        // Out-of-town is its own toggle/section, surfaced elsewhere.
        outOfTown: false,
        outOfTownUntil: null,
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
      {/* Profile picture */}
      <section id="profile-picture" className="dk-asect">
        <h2 className="dk-h2">Profile picture</h2>
        <p className="dk-lede">
          Shown next to your replies in client chats. PNG, JPG, or WebP up to 2&nbsp;MB; square works best.
        </p>
        <div className="dk-card dk-pad mt-4 flex flex-wrap items-center gap-5">
          <Avatar src={avatarUrl} name="Your profile picture" size={72} tone="admin" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              className="dk-btn dk-ghost-signal"
            >
              {avatarBusy ? "Uploading…" : avatarUrl ? "Replace" : "Upload"}
            </button>
            {avatarUrl && (
              <button type="button" onClick={onRemoveAvatar} disabled={avatarBusy} className="dk-btn">
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPickAvatar}
            className="hidden"
          />
        </div>
      </section>

      {/* Live preview */}
      <section id="live-preview" className="dk-asect dk-card dk-status">
        <small>
          Live preview — what customers see right now
        </small>
        <div>
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
          <span>
            {preview.label} — {preview.detail}
          </span>
        </div>
      </section>

      {/* Hours */}
      <section id="business-hours" className="dk-asect">
        <div className="dk-tzrow">
          <h2 className="dk-h2">Business Hours</h2>
          <label className="flex items-center gap-2">
            <span className="dk-flabel">
              Timezone
            </span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="dk-select"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>

        <ul className="dk-card dk-hours mt-4">
          {WEEKDAY_LABELS.map(([key, label]) => {
            const day = hours[key];
            return (
              <li key={key} className="dk-hrow">
                <button
                  type="button"
                  role="switch"
                  aria-checked={day.enabled}
                  onClick={() => setDayEnabled(key, !day.enabled)}
                  aria-label={label}
                  className="dk-switch"
                />
                <span className="dk-day">
                  {label}
                </span>
                {day.enabled ? (
                  <span className="dk-times">
                    <input
                      type="time"
                      value={day.open ?? "09:00"}
                      onChange={(e) => setDayOpen(key, e.target.value)}
                      className="dk-tin"
                      aria-label={`${label} open`}
                    />
                    <span className="dk-arr" aria-hidden="true">→</span>
                    <input
                      type="time"
                      value={day.close ?? "17:00"}
                      onChange={(e) => setDayClose(key, e.target.value)}
                      className="dk-tin"
                      aria-label={`${label} close`}
                    />
                  </span>
                ) : (
                  <span className="dk-closed">closed</span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="dk-save">
          <button
            type="button"
            onClick={saveHours}
            disabled={savingHours}
            className="dk-btn dk-ghost-signal"
          >
            {savingHours ? "Saving…" : "Save hours"}
          </button>
        </div>
      </section>

      {/* OOO */}
      <section id="out-of-office" className="dk-asect">
        <h2 className="dk-h2">Out of Office</h2>

        <div className="dk-card dk-pad space-y-4 mt-4">
          <label className="dk-swrow">
            <button
              type="button"
              role="switch"
              aria-checked={oooEnabled}
              onClick={() => setOooEnabled((v) => !v)}
              className="dk-switch"
            />
            <span className="font-semibold text-ink">
              {oooEnabled ? "Out of office is ON" : "Out of office is off"}
            </span>
          </label>

          <div>
            <span className="dk-flabel block mb-1.5">
              Starts on (optional — leave blank to start now; time defaults to start of day)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={oooFrom}
                onChange={(e) => setOooFrom(e.target.value)}
                aria-label="Start date"
                className="dk-tin"
              />
              <span className="dk-at">
                at
              </span>
              <input
                type="time"
                value={oooFromTime}
                onChange={(e) => setOooFromTime(e.target.value)}
                disabled={!oooFrom}
                aria-label="Start time"
                className="dk-tin disabled:opacity-50"
              />
              {(oooFrom || oooFromTime) && (
                <button
                  type="button"
                  onClick={() => {
                    setOooFrom("");
                    setOooFromTime("");
                  }}
                  aria-label="Clear start date and time"
                  className="dk-tbtn"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="dk-flabel block mb-1.5">
              Return on (optional — auto-resumes; time defaults to end of day)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={oooUntil}
                onChange={(e) => setOooUntil(e.target.value)}
                aria-label="Return date"
                className="dk-tin"
              />
              <span className="dk-at">
                at
              </span>
              <input
                type="time"
                value={oooUntilTime}
                onChange={(e) => setOooUntilTime(e.target.value)}
                disabled={!oooUntil}
                aria-label="Return time"
                className="dk-tin disabled:opacity-50"
              />
              {(oooUntil || oooUntilTime) && (
                <button
                  type="button"
                  onClick={() => {
                    setOooUntil("");
                    setOooUntilTime("");
                  }}
                  aria-label="Clear return date and time"
                  className="dk-tbtn"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <label className="block">
            <span className="dk-flabel block mb-1.5">
              Custom message (optional, 280 chars)
            </span>
            <textarea
              value={oooMessage}
              onChange={(e) => setOooMessage(e.target.value.slice(0, 280))}
              maxLength={280}
              rows={2}
              placeholder="On vacation — back Mon May 18."
              className="dk-textarea"
            />
          </label>
        </div>

        <div className="dk-save">
          <button
            type="button"
            onClick={saveOoo}
            disabled={savingOoo}
            className="dk-btn dk-ghost-signal"
          >
            {savingOoo ? "Saving…" : "Save OOO"}
          </button>
        </div>
      </section>

      {/* Vacations */}
      <VacationCalendar
        initial={initial.vacations}
        timezone={timezone}
        onOutOfTownChange={setOutOfTown}
      />

      {/* Out of Town (silent, clients see no change) */}
      <section id="out-of-town" className="dk-asect">
        <h2 className="dk-h2">Out of Town</h2>

        <div className="dk-card dk-pad space-y-3 mt-4">
          <label className="dk-swrow">
            <button
              type="button"
              role="switch"
              aria-checked={outOfTown}
              onClick={() => setOutOfTown((v) => !v)}
              className="dk-switch"
            />
            <span className="font-semibold text-ink">
              {outOfTown ? "Out of town is ON" : "Out of town is off"}
            </span>
          </label>
          <p className="dk-lede" style={{ marginTop: 0 }}>
            When on, clients won&rsquo;t see the Emergency Fix option after hours.
            Their portal looks normal &mdash; no indication you&rsquo;re away.
            Use this when traveling.
          </p>
        </div>

        <div className="dk-save">
          <button
            type="button"
            onClick={saveOutOfTown}
            disabled={savingOutOfTown}
            className="dk-btn dk-ghost-signal"
          >
            {savingOutOfTown ? "Saving…" : "Save out-of-town"}
          </button>
        </div>
      </section>

      {/* Holidays */}
      <section id="holidays" className="dk-asect">
        <h2 className="dk-h2">Holidays</h2>
        <p className="dk-lede">
          Days that count as outside business hours, in your timezone.
        </p>

        <div className="dk-card dk-pad dk-hol mt-4">
          {holidays.length === 0 ? (
            <p className="text-ink-mute w-full">
              No holidays added.
            </p>
          ) : (
            holidays.map((d, i) => (
              <div key={`${d}-${i}`} className="dk-hchip">
                <input
                  type="date"
                  value={d}
                  onChange={(e) =>
                    setHolidays((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  className="dk-hdate"
                  aria-label={`Holiday ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setHolidays((arr) => arr.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  title="Remove"
                >
                  <XIcon />
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setHolidays((arr) => [...arr, ""])}
            className="dk-addchip"
          >
            + Add holiday
          </button>
        </div>

        <div className="dk-save">
          <button
            type="button"
            onClick={saveHolidays}
            disabled={savingHolidays}
            className="dk-btn dk-ghost-signal"
          >
            {savingHolidays ? "Saving…" : "Save holidays"}
          </button>
        </div>
      </section>

      {/* Emergency Fee */}
      <section id="emergency-fee" className="dk-asect">
        <h2 className="dk-h2">Emergency Fee</h2>
        <p className="dk-lede">
          Charged when a client opts into Emergency Fix outside business hours.
        </p>

        <div className="dk-card dk-pad dk-fee mt-4">
          <span className="dk-cur">$</span>
          <input
            type="number"
            min="0"
            step="1"
            value={feeDollars}
            onChange={(e) => setFeeDollars(e.target.value)}
            className="dk-tin"
            aria-label="Emergency fee in dollars"
          />
          <span className="dk-unit">
            per emergency filing
          </span>
        </div>

        <div className="dk-save">
          <button
            type="button"
            onClick={saveFee}
            disabled={savingFee}
            className="dk-btn dk-ghost-signal"
          >
            {savingFee ? "Saving…" : "Save fee"}
          </button>
        </div>
      </section>

      <div id="notifications" className="dk-asect">
        <PushToggle />
      </div>

      <div id="passkeys" className="dk-asect">
        <PasskeyManager />
      </div>
    </div>
  );
}
