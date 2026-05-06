"use client";

import { useEffect, useRef } from "react";
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
}

export function useTicketChannel({
  ticketId,
  viewerSide,
  onMessageInsert,
  onMessageUpdate,
  onOtherTyping,
}: UseTicketChannelArgs): TicketChannelHandle {
  const channelRef = useRef<RealtimeChannel | null>(null);

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

    const channel = supabase
      .channel(`ticket:${ticketId}`, {
        config: { broadcast: { self: false } },
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
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [ticketId, viewerSide]);

  return {
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
