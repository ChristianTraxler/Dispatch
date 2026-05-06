"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  TicketDetailPage,
  type TicketDetail,
} from "@/components/TicketDetailPage";
import { ChatThread, type ChatAttachment, type ChatMessage } from "@/components/ChatThread";
import type { TicketStatus } from "@/components/StatusPill";
import {
  useTicketChannel,
  type RawMessageRow,
} from "@/lib/realtime/use-ticket-channel";

export function AdminTicketDetailClient({
  ticket,
  ticketAttachments,
  messages: initialMessages,
  otherPartyName,
  isInquiry = false,
  inquiryEndedAt = null,
}: {
  ticket: TicketDetail;
  ticketAttachments: ChatAttachment[];
  messages: ChatMessage[];
  otherPartyName: string;
  isInquiry?: boolean;
  inquiryEndedAt?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [otherPartyTyping, setOtherPartyTyping] = useState(false);

  const rawToChatMessage = useCallback(
    (row: RawMessageRow): ChatMessage => ({
      id: row.id,
      senderType: row.sender_type,
      senderName: row.sender_type === "ADMIN" ? "Christian" : otherPartyName,
      body: row.body,
      createdAt: row.created_at,
      readAt: row.read_at,
    }),
    [otherPartyName],
  );

  const handleInsert = useCallback(
    (row: RawMessageRow) => {
      // Refresh on attachment messages — paths need server-side hydration.
      const hasAttachments =
        Array.isArray(row.attachments) && (row.attachments as unknown[]).length > 0;
      if (hasAttachments) {
        router.refresh();
        return;
      }
      const incoming = rawToChatMessage(row);
      setMessages((prev) =>
        prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
      );
      if (row.sender_type === "CLIENT") {
        fetch(`/api/admin/tickets/${ticket.id}/mark-read`, { method: "POST" }).catch(
          () => {},
        );
      }
    },
    [rawToChatMessage, ticket.id, router],
  );

  const handleUpdate = useCallback(
    (row: RawMessageRow) => {
      const incoming = rawToChatMessage(row);
      setMessages((prev) =>
        prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m)),
      );
    },
    [rawToChatMessage],
  );

  const { broadcastTyping, otherPartyOnline } = useTicketChannel({
    ticketId: ticket.id,
    viewerSide: "ADMIN",
    onMessageInsert: handleInsert,
    onMessageUpdate: handleUpdate,
    onOtherTyping: setOtherPartyTyping,
  });

  useEffect(() => {
    fetch(`/api/admin/tickets/${ticket.id}/mark-read`, { method: "POST" }).catch(
      () => {},
    );
  }, [ticket.id]);

  async function onSendMessage({
    body,
    attachments,
  }: {
    body: string;
    attachments: ChatAttachment[];
  }) {
    const res = await fetch(`/api/admin/tickets/${ticket.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        attachments: attachments
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
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(err.error ?? "Could not send the message.");
      return;
    }
    const result = (await res.json()) as { message: ChatMessage };
    setMessages((prev) =>
      prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message],
    );
  }

  async function onStatusChange(newStatus: TicketStatus) {
    const res = await fetch(`/api/admin/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(err.error ?? "Could not change status.");
      return;
    }
    router.refresh();
  }

  function onBack() {
    router.push(isInquiry ? "/admin/inquiries" : "/admin/tickets");
  }

  const [busy, setBusy] = useState(false);

  async function onPromote() {
    if (!confirm("Promote this inquiry to a tracked ticket? It'll appear in the main tickets queue and start the standard status flow.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/promote`, { method: "POST" });
      if (!res.ok) {
        alert("Promote failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onEndChat() {
    if (!confirm("End this chat? It'll move to the archived list, and we'll both get an email transcript.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/end-inquiry`, { method: "POST" });
      if (!res.ok) {
        alert("End chat failed.");
        return;
      }
      router.push("/admin/inquiries");
    } finally {
      setBusy(false);
    }
  }

  if (isInquiry) {
    return (
      <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors mb-4"
        >
          ← Back to inquiries
        </button>

        <header className="mb-6 rule-double pb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="inline-block px-2.5 py-0.5 border border-signal-red text-signal-red bg-parchment-warm font-mono text-[0.6rem] uppercase tracking-widest">
              Inquiry
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-fade">
              {ticket.ticketNumber}
            </span>
          </div>
          <h1
            className="font-display text-3xl md:text-4xl leading-tight mb-2"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Quick chat with {otherPartyName}
          </h1>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display italic text-ink-mute">
              {ticket.siteDisplayName}
            </span>
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-fade">
              {ticket.siteUrl}
            </span>
          </div>
        </header>

        {!inquiryEndedAt && (
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              type="button"
              onClick={onPromote}
              disabled={busy}
              className="px-4 py-2 bg-ink text-parchment-warm font-mono text-[0.65rem] uppercase tracking-widest hover:bg-signal-red transition-colors disabled:opacity-50"
            >
              Promote to ticket →
            </button>
            <button
              type="button"
              onClick={onEndChat}
              disabled={busy}
              className="px-4 py-2 border border-rule font-mono text-[0.65rem] uppercase tracking-widest text-ink-soft hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
            >
              End chat
            </button>
          </div>
        )}

        {inquiryEndedAt && (
          <div className="mb-6 px-4 py-3 border border-rule bg-parchment-warm/60 font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
            Chat ended {new Date(inquiryEndedAt).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" })}
          </div>
        )}

        <ChatThread
          messages={messages}
          viewerType="admin"
          otherPartyName={otherPartyName}
          otherPartyOnline={otherPartyOnline}
          otherPartyTyping={otherPartyTyping}
          onSendMessage={inquiryEndedAt ? undefined : (onSendMessage as never)}
          onTypingChange={broadcastTyping}
        />
      </div>
    );
  }

  return (
    <TicketDetailPage
      ticket={ticket}
      ticketAttachments={ticketAttachments}
      messages={messages}
      viewerType="admin"
      otherPartyName={otherPartyName}
      otherPartyOnline={otherPartyOnline}
      otherPartyTyping={otherPartyTyping}
      onSendMessage={onSendMessage as never}
      onTypingChange={broadcastTyping}
      onStatusChange={onStatusChange}
      onBack={onBack}
    />
  );
}
