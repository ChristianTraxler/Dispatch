"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Subscribe to any postgres_changes event on `table` and call
 * router.refresh() — re-runs the server component, re-fetches data,
 * and re-renders without a full page reload.
 *
 * Use this on list pages where the data backing the list lives in a
 * single table the viewer is allowed to SELECT (RLS still applies).
 *
 * Note: this calls setAuth before subscribe, so RLS sees an authed
 * connection and admin policies actually pass through events. (Same
 * gotcha as use-ticket-channel.)
 */
export function useRealtimeRefresh({
  table,
  filter,
}: {
  table: string;
  filter?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      const channel = supabase
        .channel(`refresh:${table}:${filter ?? "all"}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            ...(filter ? { filter } : {}),
          },
          () => router.refresh(),
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [table, filter, router]);
}
