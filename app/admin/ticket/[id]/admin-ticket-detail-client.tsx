"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  TicketDetailPage,
  type TicketDetail,
} from "@/components/TicketDetailPage";
import type { ChatMessage } from "@/components/ChatThread";
import type { TicketStatus } from "@/components/StatusPill";
import {
  useTicketChannel,
  type RawMessageRow,
} from "@/lib/realtime/use-ticket-channel";

export function AdminTicketDetailClient({
  ticket,
  messages: initialMessages,
  otherPartyName,
  otherPartyOnline,
}: {
  ticket: TicketDetail;
  messages: ChatMessage[];
  otherPartyName: string;
  otherPartyOnline: boolean;
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
    [rawToChatMessage, ticket.id],
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

  const { broadcastTyping } = useTicketChannel({
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

  async function onSendMessage({ body }: { body: string; attachments: never[] }) {
    const res = await fetch(`/api/admin/tickets/${ticket.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
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
    router.push("/admin/tickets");
  }

  return (
    <TicketDetailPage
      ticket={ticket}
      messages={messages}
      viewerType="admin"
      otherPartyName={otherPartyName}
      otherPartyOnline={otherPartyOnline}
      otherPartyTyping={otherPartyTyping}
      onSendMessage={onSendMessage}
      onTypingChange={broadcastTyping}
      onStatusChange={onStatusChange}
      onBack={onBack}
    />
  );
}
