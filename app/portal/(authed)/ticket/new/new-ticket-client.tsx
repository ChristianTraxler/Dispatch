"use client";

import { useRouter } from "next/navigation";
import {
  NewTicketPage,
  type NewTicketSite,
  type NewTicketSubmission,
} from "@/components/NewTicketPage";

export function NewTicketClient({
  sites,
  defaultSiteId,
}: {
  sites: NewTicketSite[];
  defaultSiteId?: string;
}) {
  const router = useRouter();

  async function onSubmit(data: NewTicketSubmission) {
    const res = await fetch("/api/portal/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: data.siteId,
        title: data.title,
        description: data.description,
        category: data.category,
        // Phase 10 wires real attachments through Supabase Storage; for now
        // strip them so the create succeeds even if the dropzone has files.
        attachments: [],
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Could not file the ticket. Try again.");
      return;
    }
    const body = (await res.json()) as { ticket: { id: string } };
    router.push(`/portal/ticket/${body.ticket.id}`);
    router.refresh();
  }

  function onCancel() {
    router.push("/portal/dashboard");
  }

  return (
    <NewTicketPage
      sites={sites}
      defaultSiteId={defaultSiteId}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}
