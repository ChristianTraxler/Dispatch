"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { ChatThread, type ChatMessage, type ChatAttachment } from "@/components/ChatThread";
import { useTicketChannel } from "@/lib/realtime/use-ticket-channel";
import { useAdminPresence } from "@/lib/realtime/use-presence";
import { useUnreadCount } from "@/lib/realtime/use-unread-count";

type LauncherState =
  | { kind: "collapsed" }
  | { kind: "loading" }
  | { kind: "open"; ticketId: string; messages: ChatMessage[]; ended: boolean }
  | { kind: "promoted"; ticketId: string }
  | { kind: "error"; message: string };

export function QuickChatLauncher({
  adminAvatarUrl,
  clientAvatarUrl,
}: {
  adminAvatarUrl?: string | null;
  clientAvatarUrl?: string | null;
}) {
  const [state, setState] = useState<LauncherState>({ kind: "collapsed" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; endedAt: string; messageCount: number }>>([]);
  const [busy, setBusy] = useState(false);

  const ticketIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.kind === "open") ticketIdRef.current = state.ticketId;
  });

  const { count: unreadCount, refresh: refreshUnread } = useUnreadCount(
    "/api/portal/inquiries/unread",
  );

  const open = useCallback(async () => {
    setMenuOpen(false);
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/portal/inquiries", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({ kind: "error", message: data.error ?? "Couldn't start a chat." });
        return;
      }
      const data = (await res.json()) as { ticketId: string; messages: ChatMessage[] };
      setState({ kind: "open", ticketId: data.ticketId, messages: data.messages, ended: false });
      // Mark all admin messages on this inquiry as read; refetch the badge.
      void fetch(`/api/portal/tickets/${data.ticketId}/mark-read`, { method: "POST" })
        .catch(() => {})
        .then(() => refreshUnread());
    } catch {
      setState({ kind: "error", message: "Network error." });
    }
  }, [refreshUnread]);

  const collapse = useCallback(() => {
    setState({ kind: "collapsed" });
    setMenuOpen(false);
    setHistoryOpen(false);
  }, []);

  const sendMessage = useCallback(
    async (data: { body: string; attachments: ChatAttachment[] }) => {
      const ticketId = ticketIdRef.current;
      if (!ticketId) return;
      const res = await fetch(`/api/portal/tickets/${ticketId}/messages`, {
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
        s.kind === "open"
          ? { ...s, messages: [...s.messages, payload.message] }
          : s,
      );
    },
    [],
  );

  const promote = async () => {
    if (state.kind !== "open") return;
    if (!confirm("Promote this chat to a tracked ticket? You'll be able to follow its progress on your dashboard.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/tickets/${state.ticketId}/promote`, { method: "POST" });
      if (!res.ok) {
        alert("Promote failed.");
        return;
      }
      setState({ kind: "promoted", ticketId: state.ticketId });
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const endChat = async () => {
    if (state.kind !== "open") return;
    if (!confirm("End this chat? Your history stays viewable, and we'll both get an email transcript.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/tickets/${state.ticketId}/end-inquiry`, { method: "POST" });
      if (!res.ok) {
        alert("End chat failed.");
        return;
      }
      collapse();
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async () => {
    setHistoryOpen(true);
    setMenuOpen(false);
    try {
      const res = await fetch("/api/portal/inquiries/history");
      if (!res.ok) return;
      const data = (await res.json()) as { items: typeof history };
      setHistory(data.items);
    } catch {
      /* ignore */
    }
  };

  const adminOnline = useAdminPresence();

  const activeTicketId = state.kind === "open" ? state.ticketId : "";
  const { otherPartyOnline: ticketChannelOnline } = useTicketChannel({
    ticketId: activeTicketId,
    viewerSide: "CLIENT",
    onMessageInsert: (row) => {
      if (row.sender_type === "CLIENT") return;
      void fetch("/api/portal/inquiries", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ticketId: string; messages: ChatMessage[] } | null) => {
          if (!data) return;
          setState((s) =>
            s.kind === "open" && s.ticketId === data.ticketId
              ? { ...s, messages: data.messages }
              : s,
          );
        });
    },
  });

  const isCollapsed = state.kind === "collapsed";

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={
          unreadCount > 0
            ? `Have a question? ${unreadCount} unread`
            : "Have a question?"
        }
        title="Have a question?"
        className={`group fixed bottom-6 right-6 z-50 w-[60px] h-[60px] rounded-full bg-signal-red text-parchment-warm flex items-center justify-center origin-bottom-right shadow-[0_10px_28px_-6px_rgba(200,52,26,0.45),_0_2px_6px_-1px_rgba(26,24,21,0.12)] ring-1 ring-inset ring-white/15 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red focus-visible:ring-offset-2 focus-visible:ring-offset-parchment ${
          isCollapsed
            ? "opacity-100 scale-100 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-8px_rgba(200,52,26,0.55),_0_4px_10px_-2px_rgba(26,24,21,0.16)] active:translate-y-0 active:scale-95"
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
            className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-ink text-parchment-warm font-mono text-[0.65rem] font-medium leading-none flex items-center justify-center ring-2 ring-parchment shadow-md"
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
        <div className="font-mono text-[0.65rem] uppercase tracking-widest">
          Quick chat
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
                    onClick={loadHistory}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors border-t border-rule-soft"
                  >
                    View past chats
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
            onClick={open}
            className="px-3 py-2 border border-rule font-mono text-[0.6rem] uppercase tracking-widest hover:border-signal-red hover:text-signal-red transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "promoted" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <p className="font-display text-lg text-ink">This chat is now a tracked ticket.</p>
          <Link
            href={`/portal/ticket/${state.ticketId}`}
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
              This is a quick chat. If it turns into something we need to track, either of us can promote it to a ticket.
            </div>
          )}
          {state.ended && (
            <div className="px-4 py-3 bg-parchment-deep border-b border-rule-soft font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              This chat has ended. Close and reopen the launcher to start a new one.
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <ChatThread
              messages={state.messages}
              viewerType="client"
              otherPartyName="Christian"
              otherPartyOnline={adminOnline || ticketChannelOnline}
              onSendMessage={state.ended ? undefined : sendMessage}
              clientAvatarUrl={clientAvatarUrl ?? null}
              adminAvatarUrl={adminAvatarUrl ?? null}
              className="h-full"
            />
          </div>
        </>
      )}

      {historyOpen && (
        <div className="absolute inset-0 bg-parchment-warm overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
            <div className="font-mono text-[0.65rem] uppercase tracking-widest">Past chats</div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="px-2 py-1 hover:text-signal-red transition-colors"
              aria-label="Close history"
            >
              ×
            </button>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-6 font-display italic text-ink-mute">No past chats yet.</p>
          ) : (
            <ul className="divide-y divide-rule-soft">
              {history.map((h) => (
                <li key={h.id} className="px-4 py-3">
                  <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                    {new Date(h.endedAt).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                  </div>
                  <div className="font-display text-sm text-ink">
                    {h.messageCount} message{h.messageCount === 1 ? "" : "s"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </>
  );
}
