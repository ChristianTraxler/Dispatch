"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Subscribe to UPDATE events on `tickets` for one specific id and fire
 * `onUpdate` whenever the row changes while the page is mounted — e.g. the
 * other party confirms a fix, reopens, or the status otherwise moves out
 * from under the viewer. Mirrors useTicketDeletionWatch's connection setup.
 */
export function useTicketStatusWatch(ticketId: string, onUpdate: () => void) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!ticketId) return;
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
        .channel(`ticket-status:${ticketId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tickets",
            filter: `id=eq.${ticketId}`,
          },
          () => onUpdateRef.current(),
        )
        .subscribe();

      if (cancelled) {
        supabase.removeChannel(channel);
        return;
      }

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [ticketId]);
}
