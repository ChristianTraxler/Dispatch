"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ChatThread, type ChatMessage, type ChatAttachment } from "@/components/ChatThread";
import { Avatar } from "@/components/Avatar";
import { useTicketChannel } from "@/lib/realtime/use-ticket-channel";
import { useClientsPresence } from "@/lib/realtime/use-presence";
import { useUnreadCount } from "@/lib/realtime/use-unread-count";

interface ClientRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  hasActiveInquiry: boolean;
  unreadCount: number;
  latestMessage: {
    body: string;
    senderType: "CLIENT" | "ADMIN";
    at: string;
  } | null;
}

type LauncherState =
  | { kind: "collapsed" }
  | { kind: "picker" }
  | { kind: "loading"; clientId: string }
  | {
      kind: "open";
      ticketId: string;
      clientId: string;
      clientName: string;
      clientAvatarUrl: string | null;
      messages: ChatMessage[];
      ended: boolean;
    }
  | { kind: "promoted"; ticketId: string; clientName: string }
  | { kind: "error"; message: string };

const ADMIN_AVATAR_URL = "/icon.png";

export function AdminQuickChatLauncher() {
  const [state, setState] = useState<LauncherState>({ kind: "collapsed" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [filter, setFilter] = useState("");

  const ticketIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.kind === "open") ticketIdRef.current = state.ticketId;
  });

  const refreshClients = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/inquiries/clients", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { clients: ClientRow[] };
      setClients(data.clients);
    } catch {
      /* ignore */
    }
  }, []);

  const openPicker = useCallback(async () => {
    setMenuOpen(false);
    setState({ kind: "picker" });
    try {
      const res = await fetch("/api/admin/inquiries/clients", { cache: "no-store" });
      if (!res.ok) {
        setState({ kind: "error", message: "Couldn't load clients." });
        return;
      }
      const data = (await res.json()) as { clients: ClientRow[] };
      setClients(data.clients);
    } catch {
      setState({ kind: "error", message: "Network error." });
    }
  }, []);

  const collapse = useCallback(() => {
    setState({ kind: "collapsed" });
    setMenuOpen(false);
    setFilter("");
  }, []);

  const { count: unreadCount, refresh: refreshUnread } = useUnreadCount(
    "/api/admin/inquiries/unread",
  );

  // While the picker is open, keep the client list fresh in real-time so
  // newly arrived messages show up (preview + unread badge) without the admin
  // having to back out and reopen.
  const pickerOpen = state.kind === "picker";
  useEffect(() => {
    if (!pickerOpen) return;
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
        .channel("admin-picker-refresh")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          () => {
            refreshClients();
          },
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pickerOpen, refreshClients]);

  const pickClient = useCallback(async (clientId: string) => {
    setState({ kind: "loading", clientId });
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientAccountId: clientId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({ kind: "error", message: data.error ?? "Couldn't open chat." });
        return;
      }
      const data = (await res.json()) as {
        ticketId: string;
        messages: ChatMessage[];
        clientName: string;
        clientAvatarUrl: string | null;
      };
      setState({
        kind: "open",
        ticketId: data.ticketId,
        clientId,
        clientName: data.clientName,
        clientAvatarUrl: data.clientAvatarUrl,
        messages: data.messages,
        ended: false,
      });
      // Mark all client messages on this inquiry as read; refresh badge.
      void fetch(`/api/admin/tickets/${data.ticketId}/mark-read`, { method: "POST" })
        .catch(() => {})
        .then(() => refreshUnread());
    } catch {
      setState({ kind: "error", message: "Network error." });
    }
  }, [refreshUnread]);

  const sendMessage = useCallback(
    async (data: { body: string; attachments: ChatAttachment[] }) => {
      const ticketId = ticketIdRef.current;
      if (!ticketId) return;
      const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: data.body,
          attachments: data.attachments
            .filter((a) => a.path)
            .map((a) => ({
              filename: a.filename,
              path: a.path!,
              contentType: a.contentType,
              sizeBytes: a.sizeBytes,
            })),
        }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setState((s) => (s.kind === "open" ? { ...s, ended: true } : s));
        }
        throw new Error("Send failed.");
      }
      const payload = (await res.json()) as { message: ChatMessage };
      setState((s) =>
        s.kind === "open" ? { ...s, messages: [...s.messages, payload.message] } : s,
      );
    },
    [],
  );

  const promote = async () => {
    if (state.kind !== "open") return;
    if (!confirm("Promote this chat to a tracked ticket? It'll appear in the main tickets queue and start the standard status flow.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${state.ticketId}/promote`, {
        method: "POST",
      });
      if (!res.ok) {
        alert("Promote failed.");
        return;
      }
      setState({ kind: "promoted", ticketId: state.ticketId, clientName: state.clientName });
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const endChat = async () => {
    if (state.kind !== "open") return;
    if (!confirm("End this chat? It'll move to the archived list, and we'll both get an email transcript.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${state.ticketId}/end-inquiry`, {
        method: "POST",
      });
      if (!res.ok) {
        alert("End chat failed.");
        return;
      }
      collapse();
    } finally {
      setBusy(false);
    }
  };

  const onlineClients = useClientsPresence();
  const otherPartyOnline =
    state.kind === "open" ? onlineClients.has(state.clientId) : false;

  const activeTicketId = state.kind === "open" ? state.ticketId : "";
  const { otherPartyOnline: ticketChannelOnline } = useTicketChannel({
    ticketId: activeTicketId,
    viewerSide: "ADMIN",
    onMessageUpdate: (row) => {
      setState((s) => {
        if (s.kind !== "open" || s.ticketId !== row.ticket_id) return s;
        return {
          ...s,
          messages: s.messages.map((m) =>
            m.id === row.id ? { ...m, readAt: row.read_at, body: row.body } : m,
          ),
        };
      });
    },
    onMessageInsert: (row) => {
      if (row.sender_type === "ADMIN") return;
      const ticketId = ticketIdRef.current;
      const clientId = state.kind === "open" ? state.clientId : null;
      if (!ticketId || !clientId) return;
      // Refetch the hydrated message list (handles attachments + senderName).
      void fetch("/api/admin/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientAccountId: clientId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ticketId: string; messages: ChatMessage[] } | null) => {
          if (!data) return;
          setState((s) =>
            s.kind === "open" && s.ticketId === data.ticketId
              ? { ...s, messages: data.messages }
              : s,
          );
        });
      // Panel is open on this client's inquiry → mark the new client message
      // read immediately so they see the read receipt without us closing.
      void fetch(`/api/admin/tickets/${row.ticket_id}/mark-read`, { method: "POST" })
        .catch(() => {})
        .then(() => refreshUnread());
    },
  });

  const filtered = clients
    .filter((c) => {
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Unread first (highest count first), then by latest message recency, then by name
      if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      const aTime = a.latestMessage ? new Date(a.latestMessage.at).getTime() : 0;
      const bTime = b.latestMessage ? new Date(b.latestMessage.at).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.name.localeCompare(b.name);
    });

  const isCollapsed = state.kind === "collapsed";

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={
          unreadCount > 0
            ? `Start a quick chat — ${unreadCount} unread`
            : "Start a quick chat"
        }
        title="Start a quick chat"
        className={`group fixed bottom-6 right-6 z-50 w-[60px] h-[60px] rounded-full bg-ink text-parchment-warm flex items-center justify-center origin-bottom-right shadow-[0_10px_28px_-6px_rgba(26,24,21,0.45),_0_2px_6px_-1px_rgba(26,24,21,0.18)] ring-1 ring-inset ring-signal-red/45 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red focus-visible:ring-offset-2 focus-visible:ring-offset-parchment ${
          isCollapsed
            ? "opacity-100 scale-100 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-8px_rgba(26,24,21,0.55),_0_4px_10px_-2px_rgba(26,24,21,0.22)] active:translate-y-0 active:scale-95"
            : "opacity-0 scale-50 pointer-events-none"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="transition-transform duration-200 ease-out group-hover:scale-105"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {isCollapsed && unreadCount > 0 && (
          <span
            className="badge-wiggle absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full text-parchment-warm font-mono text-[0.65rem] font-medium leading-none flex items-center justify-center ring-2 ring-parchment shadow-md"
            style={{ backgroundColor: "#FF4500" }}
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <div
        aria-hidden={isCollapsed}
        className={`fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-2rem)] bg-parchment-warm border border-rule shadow-2xl flex flex-col origin-bottom-right transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] ${
          isCollapsed
            ? "opacity-0 scale-90 translate-y-2 pointer-events-none"
            : "opacity-100 scale-100 translate-y-0"
        }`}
      >
      <div className="flex items-center justify-between px-4 py-3 border-b border-rule bg-ink text-parchment-warm">
        <div className="flex items-center gap-2 min-w-0">
          {state.kind === "open" && (
            <button
              type="button"
              onClick={openPicker}
              className="px-1 py-1 -ml-1 hover:text-signal-red transition-colors shrink-0"
              aria-label="Back to client list"
              title="Back to client list"
            >
              ←
            </button>
          )}
          <div className="font-mono text-[0.65rem] uppercase tracking-widest truncate">
            {state.kind === "open" ? `Quick chat · ${state.clientName}` : "Quick chat"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.kind === "open" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="px-2 py-1 hover:text-signal-red transition-colors"
                aria-label="Chat options"
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-parchment-warm text-ink border border-rule shadow-lg z-10">
                  <button
                    type="button"
                    onClick={promote}
                    disabled={busy}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors disabled:opacity-50"
                  >
                    Promote to ticket
                  </button>
                  <button
                    type="button"
                    onClick={endChat}
                    disabled={busy}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors disabled:opacity-50"
                  >
                    End chat
                  </button>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors border-t border-rule-soft"
                  >
                    Chat with another client
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={collapse}
            className="px-2 py-1 hover:text-signal-red transition-colors"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      {state.kind === "picker" && (
        <>
          <div className="px-4 py-3 border-b border-rule-soft">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search clients…"
              className="w-full px-3 py-2 border border-rule bg-parchment text-ink font-display text-sm focus:outline-none focus:border-signal-red"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 font-display italic text-ink-mute">
                {clients.length === 0 ? "Loading clients…" : "No matches."}
              </p>
            ) : (
              <ul className="divide-y divide-rule-soft">
                {filtered.map((c) => {
                  const last = c.latestMessage;
                  const showPreview = Boolean(last);
                  const preview = last
                    ? `${last.senderType === "ADMIN" ? "You: " : ""}${last.body.trim()}`
                    : "";
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickClient(c.id)}
                        className={`block w-full text-left px-4 py-3 transition-colors ${
                          c.unreadCount > 0
                            ? "bg-parchment-deep/30 hover:bg-parchment-deep/50"
                            : "hover:bg-parchment-deep/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar src={c.avatarUrl} name={c.name} size={32} tone="client" />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`font-display text-base text-ink truncate ${
                                c.unreadCount > 0 ? "font-medium" : ""
                              }`}
                            >
                              {c.name}
                            </p>
                            {showPreview ? (
                              <p
                                className={`text-sm truncate ${
                                  c.unreadCount > 0
                                    ? "font-display text-ink-soft"
                                    : "font-display italic text-ink-mute"
                                }`}
                              >
                                {preview}
                              </p>
                            ) : (
                              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade truncate">
                                {c.email}
                              </p>
                            )}
                          </div>
                          {c.unreadCount > 0 ? (
                            <span
                              className="badge-wiggle min-w-[20px] h-[20px] px-1.5 rounded-full text-parchment-warm font-mono text-[0.65rem] font-medium leading-none flex items-center justify-center shrink-0"
                              style={{ backgroundColor: "#FF4500" }}
                              aria-label={`${c.unreadCount} unread`}
                            >
                              {c.unreadCount > 99 ? "99+" : c.unreadCount}
                            </span>
                          ) : c.hasActiveInquiry ? (
                            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red shrink-0">
                              Active
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {state.kind === "loading" && (
        <div className="flex-1 flex items-center justify-center font-display italic text-ink-mute">
          Loading…
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="font-display italic text-ink-mute mb-4">{state.message}</p>
          <button
            type="button"
            onClick={openPicker}
            className="px-3 py-2 border border-rule font-mono text-[0.6rem] uppercase tracking-widest hover:border-signal-red hover:text-signal-red transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "promoted" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <p className="font-display text-lg text-ink">
            Chat with {state.clientName} is now a tracked ticket.
          </p>
          <Link
            href={`/admin/ticket/${state.ticketId}`}
            className="px-4 py-2 bg-ink text-parchment-warm font-mono text-[0.65rem] uppercase tracking-widest hover:bg-signal-red transition-colors"
          >
            Open the ticket →
          </Link>
          <button
            type="button"
            onClick={collapse}
            className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-ink transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {state.kind === "open" && (
        <>
          {state.messages.length === 0 && !state.ended && (
            <div className="px-4 py-3 bg-parchment-deep/40 border-b border-rule-soft font-display italic text-ink-mute text-sm">
              First message starts the chat. {state.clientName} will see it next time they open their portal.
            </div>
          )}
          {state.ended && (
            <div className="px-4 py-3 bg-parchment-deep border-b border-rule-soft font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              This chat has ended.
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <ChatThread
              messages={state.messages}
              viewerType="admin"
              otherPartyName={state.clientName}
              otherPartyOnline={otherPartyOnline || ticketChannelOnline}
              onSendMessage={state.ended ? undefined : sendMessage}
              clientAvatarUrl={state.clientAvatarUrl}
              adminAvatarUrl={ADMIN_AVATAR_URL}
              clientName={state.clientName}
              className="h-full"
            />
          </div>
        </>
      )}
      </div>
    </>
  );
}
