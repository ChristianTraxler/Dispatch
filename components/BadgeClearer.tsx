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
      // Both calls are optional-chained: Badging is unsupported in plain
      // Safari and on desktop browsers that never installed the app.
      navigator.clearAppBadge?.().catch(() => {});
      navigator.serviceWorker?.controller?.postMessage({
        type: "dispatch:clear-badge",
      });
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
