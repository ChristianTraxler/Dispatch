"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type RawMessageRow = {
  id: string;
  ticket_id: string;
  sender_type: "CLIENT" | "ADMIN";
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  attachments: unknown;
};

export type ViewerSide = "CLIENT" | "ADMIN";

export interface UseTicketChannelArgs {
  ticketId: string;
  /** Which side this hook instance is on. The other side's typing events
   *  trigger onOtherTyping; our own broadcasts get filtered out. */
  viewerSide: ViewerSide;
  onMessageInsert?: (row: RawMessageRow) => void;
  onMessageUpdate?: (row: RawMessageRow) => void;
  onOtherTyping?: (isTyping: boolean) => void;
}

export interface TicketChannelHandle {
  /** Tell the channel that "we" are or aren't typing right now. */
  broadcastTyping: (isTyping: boolean) => void;
  /** Whether the other party is currently joined to this ticket channel. */
  otherPartyOnline: boolean;
}

export function useTicketChannel({
  ticketId,
  viewerSide,
  onMessageInsert,
  onMessageUpdate,
  onOtherTyping,
}: UseTicketChannelArgs): TicketChannelHandle {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [otherPartyOnline, setOtherPartyOnline] = useState(false);

  // Refs for the latest callbacks so we don't tear down/rebuild the channel
  // every render when the parent re-creates inline handlers.
  const onInsertRef = useRef(onMessageInsert);
  const onUpdateRef = useRef(onMessageUpdate);
  const onTypingRef = useRef(onOtherTyping);
  onInsertRef.current = onMessageInsert;
  onUpdateRef.current = onMessageUpdate;
  onTypingRef.current = onOtherTyping;

  useEffect(() => {
    if (!ticketId) return;
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      // Realtime auth doesn't auto-propagate from cookies in @supabase/ssr —
      // we have to explicitly hand the JWT to the websocket *before* subscribe,
      // otherwise RLS treats the connection as anon and silently drops
      // postgres_changes events. (Broadcast events bypass RLS, which is why
      // typing indicators worked but messages didn't.)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      const authSub = supabase.auth.onAuthStateChange((_event, next) => {
        if (next) supabase.realtime.setAuth(next.access_token);
      });

      const channel = supabase
        .channel(`ticket:${ticketId}`, {
          config: {
            broadcast: { self: false },
            presence: { key: viewerSide },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `ticket_id=eq.${ticketId}`,
          },
          (payload: { new: RawMessageRow }) => {
            onInsertRef.current?.(payload.new);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `ticket_id=eq.${ticketId}`,
          },
          (payload: { new: RawMessageRow }) => {
            onUpdateRef.current?.(payload.new);
          },
        )
        .on(
          "broadcast",
          { event: "typing" },
          ({ payload }: { payload: { from: ViewerSide; isTyping: boolean } }) => {
            if (!payload || payload.from === viewerSide) return;
            onTypingRef.current?.(payload.isTyping);
          },
        )
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const otherSide: ViewerSide = viewerSide === "CLIENT" ? "ADMIN" : "CLIENT";
          setOtherPartyOnline(Boolean(state[otherSide]?.length));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ from: viewerSide, at: Date.now() });
          }
        });

      if (cancelled) {
        supabase.removeChannel(channel);
        authSub.data.subscription.unsubscribe();
        return;
      }

      channelRef.current = channel;
      cleanup = () => {
        authSub.data.subscription.unsubscribe();
        supabase.removeChannel(channel);
        channelRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [ticketId, viewerSide]);

  return {
    otherPartyOnline,
    broadcastTyping(isTyping: boolean) {
      const channel = channelRef.current;
      if (!channel) return;
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { from: viewerSide, isTyping },
      });
    },
  };
}
