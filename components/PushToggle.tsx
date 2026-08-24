"use client";

import { useEffect, useState } from "react";

// The VAPID public key arrives as base64url text but pushManager.subscribe
// requires raw bytes.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

type State =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "denied"
  | "off"
  | "on";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported) {
        // iOS only exposes these APIs once the app is installed to the home
        // screen, so "unsupported on iOS" really means "not installed yet".
        const isIOS =
          /iPad|iPhone|iPod/.test(navigator.userAgent) &&
          !("MSStream" in window);
        setState(isIOS ? "needs-install" : "unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    }

    init().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      // Must be called from this click handler — iOS grants permission only
      // in response to a real user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Could not save subscription.");

      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Notifications</h2>

      {state === "needs-install" && (
        <p className="font-display italic text-ink-mute text-sm">
          To get notifications on this device, tap the Share button and choose
          &ldquo;Add to Home Screen&rdquo;, then open Dispatch from your home
          screen and come back here.
        </p>
      )}

      {state === "unsupported" && (
        <p className="font-display italic text-ink-mute text-sm">
          This browser doesn&rsquo;t support push notifications.
        </p>
      )}

      {state === "denied" && (
        <p className="font-display italic text-ink-mute text-sm">
          Notifications are blocked for Dispatch. Re-enable them in your browser
          or device settings, then reload this page.
        </p>
      )}

      {(state === "on" || state === "off") && (
        <div className="flex items-center justify-between py-2 border-b border-rule-soft gap-3">
          <span className="font-display text-sm text-ink-soft">
            {state === "on"
              ? "Push notifications are on for this device."
              : "Get notified on this device when a ticket moves."}
          </span>
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={busy}
            className="px-3 py-2 border border-rule font-mono text-[0.6rem] uppercase tracking-widest text-ink-soft hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
          >
            {busy ? "Working…" : state === "on" ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}

      {error && (
        <p className="font-display text-sm text-signal-red">{error}</p>
      )}
    </section>
  );
}
