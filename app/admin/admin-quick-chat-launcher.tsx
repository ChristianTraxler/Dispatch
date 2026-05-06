"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ChatThread, type ChatMessage, type ChatAttachment } from "@/components/ChatThread";
import { useTicketChannel } from "@/lib/realtime/use-ticket-channel";
import { useClientsPresence } from "@/lib/realtime/use-presence";

interface ClientRow {
  id: string;
  name: string;
  email: string;
  hasActiveInquiry: boolean;
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
      messages: ChatMessage[];
      ended: boolean;
    }
  | { kind: "promoted"; ticketId: string; clientName: string }
  | { kind: "error"; message: string };

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
      };
      setState({
        kind: "open",
        ticketId: data.ticketId,
        clientId,
        clientName: data.clientName,
        messages: data.messages,
        ended: false,
      });
    } catch {
      setState({ kind: "error", message: "Network error." });
    }
  }, []);

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
    onMessageInsert: (row) => {
      if (row.sender_type === "ADMIN") return;
      const ticketId = ticketIdRef.current;
      const clientId = state.kind === "open" ? state.clientId : null;
      if (!ticketId || !clientId) return;
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
    },
  });

  if (state.kind === "collapsed") {
    return (
      <button
        type="button"
        onClick={openPicker}
        aria-label="Start a quick chat"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-ink border-2 border-signal-red text-parchment-warm shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
      >
        <span className="text-2xl">💬</span>
      </button>
    );
  }

  const filtered = clients.filter((c) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-2rem)] bg-parchment-warm border border-rule shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rule bg-ink text-parchment-warm">
        <div className="font-mono text-[0.65rem] uppercase tracking-widest">
          {state.kind === "open" ? `Quick chat · ${state.clientName}` : "Quick chat"}
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
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickClient(c.id)}
                      className="block w-full text-left px-4 py-3 hover:bg-parchment-deep/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display text-base text-ink truncate">{c.name}</p>
                          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade truncate">
                            {c.email}
                          </p>
                        </div>
                        {c.hasActiveInquiry && (
                          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
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
              className="h-full"
            />
          </div>
        </>
      )}
    </div>
  );
}
