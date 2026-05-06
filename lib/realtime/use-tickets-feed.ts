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
  is_inquiry?: boolean;
  inquiry_ended_at?: string | null;
}

export interface PromotionEvent {
  id: string;
  title: string;
}

/**
 * Subscribe to tickets-table INSERT and UPDATE events globally.
 * - INSERT → onInsert (with raw row, including is_inquiry flag)
 * - UPDATE where is_inquiry flips true → false → onPromotion
 */
export function useTicketsFeed({
  onInsert,
  onPromotion,
}: {
  onInsert: (row: RawTicketRow) => void;
  onPromotion?: (event: PromotionEvent) => void;
}) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;
  const onPromotionRef = useRef(onPromotion);
  onPromotionRef.current = onPromotion;

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
          { event: "INSERT", schema: "public", table: "tickets" },
          (payload: { new: RawTicketRow }) => {
            onInsertRef.current(payload.new);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "tickets" },
          (payload: { new: RawTicketRow }) => {
            const newRow = payload.new;
            const oldRow = (payload as unknown as { old?: Partial<RawTicketRow> }).old;
            const wasInquiry = oldRow?.is_inquiry === true;
            const isInquiry = newRow.is_inquiry === true;
            if (wasInquiry && !isInquiry && onPromotionRef.current) {
              onPromotionRef.current({ id: newRow.id, title: newRow.title });
            }
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
