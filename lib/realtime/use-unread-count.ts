"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Live unread-message count for the inquiry launcher badges.
 *
 * Subscribes to all message-table inserts and updates (RLS filters delivery
 * to rows the viewer can see). On any event, refetches the count from
 * `endpoint`. Also exposes `refresh()` for manual triggers (e.g. after the
 * launcher opens and marks messages read).
 */
export function useUnreadCount(endpoint: string) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      setCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      /* ignore */
    }
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      // Initial fetch — kept inside the async block so React's strict
      // rules-of-hooks lint rule doesn't see setState happening synchronously
      // in the effect body.
      await refresh();

      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      const channel = supabase
        .channel(`unread:${endpoint}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          () => {
            refresh();
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages" },
          () => {
            refresh();
          },
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [endpoint, refresh]);

  return { count, refresh };
}
