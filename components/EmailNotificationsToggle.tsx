"use client";

import { useState } from "react";

/**
 * Client-only opt-out for ticket-update email. Deliberately not shown on the
 * admin account page: admin mail is routed by the ADMIN_EMAIL env var, not by
 * a ClientAccount row.
 *
 * Renders no heading of its own — the account page wraps this and PushToggle
 * in one "Notifications" section.
 */
export default function EmailNotificationsToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setError(null);
    // Optimistic: the row flips immediately and reverts below if the write
    // fails, so the control never sits in a "Working…" state on a slow link.
    setEnabled(next);
    try {
      const res = await fetch("/api/portal/account/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailNotifications: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save that.");
      }
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-2 border-b border-rule-soft gap-3">
        <span className="font-display text-sm text-ink-soft">
          {enabled
            ? "Email me when one of my tickets is updated."
            : "Ticket update emails are off."}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="px-3 py-2 border border-rule font-mono text-[0.6rem] uppercase tracking-widest text-ink-soft hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
        >
          {busy ? "Working…" : enabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      {!enabled && (
        <p className="font-display italic text-ink-mute text-sm">
          You&rsquo;ll still see every update in the portal, and account email
          &mdash; sign-in, password, and email changes &mdash; keeps coming.
        </p>
      )}

      {error && <p className="font-display text-sm text-signal-red">{error}</p>}
    </div>
  );
}
