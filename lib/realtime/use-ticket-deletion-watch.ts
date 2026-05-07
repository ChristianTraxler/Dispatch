"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Subscribe to the DELETE event on `tickets` for one specific id and
 * fire `onDeleted` if the row is removed while the page is mounted.
 * Used by detail pages to redirect away gracefully when the underlying
 * ticket is deleted by the other side.
 *
 * Auth token is set before subscribe (same gotcha as use-ticket-channel)
 * so RLS sees an authed connection and forwards the DELETE event.
 */
export function useTicketDeletionWatch(
  ticketId: string,
  onDeleted: () => void,
) {
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;

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
        .channel(`ticket-deletion:${ticketId}`)
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "tickets",
            filter: `id=eq.${ticketId}`,
          },
          () => onDeletedRef.current(),
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [ticketId]);
}
