"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  TicketDetailPage,
  type TicketDetail,
} from "@/components/TicketDetailPage";
import type {
  ChatAttachment,
  ChatMessage,
  ViewerType,
} from "@/components/ChatThread";
import {
  useTicketChannel,
  type RawMessageRow,
} from "@/lib/realtime/use-ticket-channel";

export function TicketDetailClient({
  ticket,
  ticketAttachments,
  messages: initialMessages,
  viewerType,
  otherPartyName,
  myName,
}: {
  ticket: TicketDetail;
  ticketAttachments: ChatAttachment[];
  messages: ChatMessage[];
  viewerType: ViewerType;
  otherPartyName: string;
  myName: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [otherPartyTyping, setOtherPartyTyping] = useState(false);

  const rawToChatMessage = useCallback(
    (row: RawMessageRow): ChatMessage => ({
      id: row.id,
      senderType: row.sender_type,
      senderName: row.sender_type === "ADMIN" ? otherPartyName : myName,
      body: row.body,
      createdAt: row.created_at,
      readAt: row.read_at,
    }),
    [otherPartyName, myName],
  );

  const handleInsert = useCallback(
    (row: RawMessageRow) => {
      // Messages with attachments need server-side hydration to swap stored
      // paths for short-lived signed URLs. Refresh the page rather than try
      // to display raw paths.
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
      // Other-party message → mark it read on our side immediately
      if (row.sender_type === "ADMIN") {
        fetch(`/api/portal/tickets/${ticket.id}/mark-read`, { method: "POST" }).catch(
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
    viewerSide: "CLIENT",
    onMessageInsert: handleInsert,
    onMessageUpdate: handleUpdate,
    onOtherTyping: setOtherPartyTyping,
  });

  // Mark unread admin messages as read when the page first renders.
  useEffect(() => {
    fetch(`/api/portal/tickets/${ticket.id}/mark-read`, { method: "POST" }).catch(
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
    const res = await fetch(`/api/portal/tickets/${ticket.id}/messages`, {
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

  async function onConfirmFixed() {
    const res = await fetch(`/api/portal/tickets/${ticket.id}/confirm`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(err.error ?? "Could not confirm the fix.");
      return;
    }
    router.refresh();
  }

  async function onReopen() {
    const res = await fetch(`/api/portal/tickets/${ticket.id}/reopen`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(err.error ?? "Could not reopen the ticket.");
      return;
    }
    router.refresh();
  }

  function onBack() {
    router.push("/portal/dashboard");
  }

  return (
    <TicketDetailPage
      ticket={ticket}
      ticketAttachments={ticketAttachments}
      messages={messages}
      viewerType={viewerType}
      otherPartyName={otherPartyName}
      otherPartyOnline={otherPartyOnline}
      otherPartyTyping={otherPartyTyping}
      onSendMessage={onSendMessage as never}
      onTypingChange={broadcastTyping}
      onConfirmFixed={onConfirmFixed}
      onReopen={onReopen}
      onBack={onBack}
    />
  );
}
