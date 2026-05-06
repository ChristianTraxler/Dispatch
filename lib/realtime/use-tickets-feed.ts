"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface RawTicketRow {
  id: string;
  client_account_id: string;
  site_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  created_at: string;
}

/**
 * Subscribe to tickets-table INSERT events globally and call the provided
 * callback for each new ticket. Mounted at the admin-shell level so it
 * fires regardless of which admin page is open.
 */
export function useTicketsFeed({
  onInsert,
}: {
  onInsert: (row: RawTicketRow) => void;
}) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

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
        .channel("admin-tickets-feed")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tickets",
          },
          (payload: { new: RawTicketRow }) => {
            onInsertRef.current(payload.new);
          },
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
}
