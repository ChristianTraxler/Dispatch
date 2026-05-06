"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

export interface OnlineClient {
  accountId: string;
  name: string;
  email: string;
  joinedAt: number;
}

// ─── ADMIN side: presence tracker (no context needed — fires once) ─────────

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

// ─── ADMIN side: client-presence watcher (provider + context) ──────────────
//
// Critical: there can only be ONE active subscription per channel name in
// the Supabase Realtime client. Multiple components calling .channel() with
// the same name return the same instance, and adding callbacks to an
// already-subscribed channel throws "cannot add 'presence' callbacks ...
// after 'subscribe()'". So we subscribe once in a provider and fan out the
// state via React context.

interface ClientsPresenceContextValue {
  online: Map<string, OnlineClient>;
}

const ClientsPresenceContext = createContext<ClientsPresenceContextValue>({
  online: new Map(),
});

export function ClientsPresenceProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<Map<string, OnlineClient>>(new Map());

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
              if (p?.accountId) next.set(p.accountId, p);
            }
          }
          setOnline(next);
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

  return (
    <ClientsPresenceContext.Provider value={{ online }}>
      {children}
    </ClientsPresenceContext.Provider>
  );
}

/** Read the live client-presence state. Requires a ClientsPresenceProvider above. */
export function useClientsPresence(): Map<string, OnlineClient> {
  return useContext(ClientsPresenceContext).online;
}

/**
 * Fire-on-change helper for AdminShell-level toasts. Compares the previous
 * online Map to the current one and calls onJoin/onLeave for diffs. Skips
 * the very first sync so we don't toast for clients already online when
 * the admin opens a tab.
 */
export function useClientsPresenceDiff({
  onJoin,
  onLeave,
}: {
  onJoin?: (client: OnlineClient) => void;
  onLeave?: (client: OnlineClient) => void;
}) {
  const online = useClientsPresence();
  const prev = useRef<Map<string, OnlineClient>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      prev.current = new Map(online);
      initialized.current = true;
      return;
    }
    for (const [id, client] of online.entries()) {
      if (!prev.current.has(id)) onJoin?.(client);
    }
    for (const [id, client] of prev.current.entries()) {
      if (!online.has(id)) onLeave?.(client);
    }
    prev.current = new Map(online);
  }, [online, onJoin, onLeave]);
}

// ─── CLIENT side: tracker + admin-presence watcher (provider + context) ────

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

const AdminPresenceContext = createContext<{ adminOnline: boolean }>({
  adminOnline: false,
});

export function AdminPresenceProvider({ children }: { children: ReactNode }) {
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
          setAdminOnline(Boolean(state["admin"]?.length));
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

  return (
    <AdminPresenceContext.Provider value={{ adminOnline }}>
      {children}
    </AdminPresenceContext.Provider>
  );
}

export function useAdminPresence(): boolean {
  return useContext(AdminPresenceContext).adminOnline;
}
