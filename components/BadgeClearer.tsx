"use client";

import { useEffect } from "react";

/**
 * Clears the app-icon badge whenever Dispatch is opened or brought back to
 * the foreground. Without this the number set by the service worker would
 * only ever go away by tapping a notification, so opening the app normally
 * would leave a stale count sitting on the icon.
 *
 * The stored count lives in the service worker (setAppBadge has no getter,
 * so it has to be persisted), which is why this posts a message rather than
 * writing the count itself. clearAppBadge is also called directly so the
 * icon updates even if the worker is slow to wake.
 */
export function BadgeClearer() {
  useEffect(() => {
    function clear() {
      // Badging is unsupported in plain Safari and on desktop browsers that
      // never installed the app, so this is optional-chained.
      navigator.clearAppBadge?.().catch(() => {});

      // Deliberately NOT `serviceWorker.controller`: that is null whenever
      // the page was not already claimed by the worker at load time, and a
      // null controller means this message is silently never sent. The
      // visible badge would clear while the worker's stored count stayed
      // put, so the next push resumed from the old number instead of 1.
      // `ready` resolves once a registration is active whether or not it
      // controls this page, and posting to it wakes a sleeping worker.
      navigator.serviceWorker?.ready
        .then((registration) => {
          registration.active?.postMessage({ type: "dispatch:clear-badge" });
        })
        .catch(() => {});
    }

    clear();

    function onVisible() {
      if (document.visibilityState === "visible") clear();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
