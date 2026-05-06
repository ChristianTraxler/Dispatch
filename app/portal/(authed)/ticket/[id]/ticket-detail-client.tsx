"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TicketDetailPage,
  type TicketDetail,
} from "@/components/TicketDetailPage";
import type { ChatMessage, ViewerType } from "@/components/ChatThread";

export function TicketDetailClient({
  ticket,
  messages: initialMessages,
  viewerType,
  otherPartyName,
  otherPartyOnline,
}: {
  ticket: TicketDetail;
  messages: ChatMessage[];
  viewerType: ViewerType;
  otherPartyName: string;
  otherPartyOnline: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  async function onSendMessage({ body }: { body: string; attachments: never[] }) {
    const res = await fetch(`/api/portal/tickets/${ticket.id}/messages`, {
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
    // Optimistic append until Phase 8 wires Realtime subscription
    setMessages((prev) => [...prev, result.message]);
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
      messages={messages}
      viewerType={viewerType}
      otherPartyName={otherPartyName}
      otherPartyOnline={otherPartyOnline}
      onSendMessage={onSendMessage}
      onConfirmFixed={onConfirmFixed}
      onReopen={onReopen}
      onBack={onBack}
    />
  );
}
