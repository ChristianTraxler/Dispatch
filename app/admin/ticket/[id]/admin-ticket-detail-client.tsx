"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TicketDetailPage,
  type TicketDetail,
} from "@/components/TicketDetailPage";
import type { ChatMessage } from "@/components/ChatThread";
import type { TicketStatus } from "@/components/StatusPill";

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
    setMessages((prev) => [...prev, result.message]);
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
      onSendMessage={onSendMessage}
      onStatusChange={onStatusChange}
      onBack={onBack}
    />
  );
}
