"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const ADMIN_CHANNEL = "admin-presence";
const CLIENTS_CHANNEL = "clients-presence";

// ─── shared helpers ─────────────────────────────────────────────────────────

async function withAuthedRealtime() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) supabase.realtime.setAuth(session.access_token);
  const sub = supabase.auth.onAuthStateChange((_event, next) => {
    if (next) supabase.realtime.setAuth(next.access_token);
  });
  return { supabase, unsub: () => sub.data.subscription.unsubscribe() };
}

// ─── ADMIN side: track self, watch clients ──────────────────────────────────

/** Mounts the admin's "I am here" track on the admin-presence channel. */
export function useAdminPresenceTracker(adminLabel: string) {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { supabase, unsub } = await withAuthedRealtime();
      if (cancelled) {
        unsub();
        return;
      }
      const channel = supabase.channel(ADMIN_CHANNEL, {
        config: { presence: { key: "admin" } },
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ label: adminLabel, at: Date.now() });
        }
      });
      cleanup = () => {
        unsub();
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [adminLabel]);
}

export interface OnlineClient {
  accountId: string;
  name: string;
  email: string;
  joinedAt: number;
}

/**
 * Subscribe to clients-presence as a read-only watcher. Returns the live set
 * of online clients keyed by accountId, plus join/leave callbacks suitable
 * for firing toast notifications.
 */
export function useClientsPresenceWatcher({
  onJoin,
  onLeave,
}: {
  onJoin?: (client: OnlineClient) => void;
  onLeave?: (client: OnlineClient) => void;
} = {}) {
  const [online, setOnline] = useState<Map<string, OnlineClient>>(new Map());
  const onJoinRef = useRef(onJoin);
  const onLeaveRef = useRef(onLeave);
  onJoinRef.current = onJoin;
  onLeaveRef.current = onLeave;

  // Initial-sync flag — we don't want to fire "joined" toasts for clients
  // that were already online when the admin opened the page.
  const initialSyncDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { supabase, unsub } = await withAuthedRealtime();
      if (cancelled) {
        unsub();
        return;
      }
      const channel = supabase.channel(CLIENTS_CHANNEL, {
        config: { presence: { key: "watcher-admin" } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const next = new Map<string, OnlineClient>();
          for (const [, presences] of Object.entries(state)) {
            for (const p of presences as unknown as OnlineClient[]) {
              if (p.accountId) next.set(p.accountId, p);
            }
          }
          setOnline(next);
          initialSyncDoneRef.current = true;
        })
        .on("presence", { event: "join" }, ({ newPresences }) => {
          if (!initialSyncDoneRef.current) return;
          for (const p of newPresences as unknown as OnlineClient[]) {
            if (p?.accountId) onJoinRef.current?.(p);
          }
        })
        .on("presence", { event: "leave" }, ({ leftPresences }) => {
          if (!initialSyncDoneRef.current) return;
          for (const p of leftPresences as unknown as OnlineClient[]) {
            if (p?.accountId) onLeaveRef.current?.(p);
          }
        })
        .subscribe();

      cleanup = () => {
        unsub();
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return online;
}

// ─── CLIENT side: track self, watch admin ──────────────────────────────────

/** Mounts the client's "I am here" track on the clients-presence channel. */
export function useClientPresenceTracker(client: {
  accountId: string;
  name: string;
  email: string;
}) {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { supabase, unsub } = await withAuthedRealtime();
      if (cancelled) {
        unsub();
        return;
      }
      const channel = supabase.channel(CLIENTS_CHANNEL, {
        config: { presence: { key: client.accountId } },
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            accountId: client.accountId,
            name: client.name,
            email: client.email,
            joinedAt: Date.now(),
          });
        }
      });
      cleanup = () => {
        unsub();
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [client.accountId, client.name, client.email]);
}

/** Returns true while at least one admin browser is on admin-presence. */
export function useAdminPresenceWatcher() {
  const [adminOnline, setAdminOnline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { supabase, unsub } = await withAuthedRealtime();
      if (cancelled) {
        unsub();
        return;
      }
      const channel = supabase.channel(ADMIN_CHANNEL, {
        config: { presence: { key: "watcher-client" } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const adminEntries = state["admin"];
          setAdminOnline(Boolean(adminEntries && adminEntries.length));
        })
        .subscribe();

      cleanup = () => {
        unsub();
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return adminOnline;
}
