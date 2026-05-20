"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminClientsPage,
  type AdminClient,
} from "@/components/AdminClientsPage";
import { useClientsPresence } from "@/lib/realtime/use-presence";

export function ClientsListClient({ initial }: { initial: AdminClient[] }) {
  const router = useRouter();
  const online = useClientsPresence();

  // Local override map so a successful email edit shows immediately without
  // waiting for router.refresh() to round-trip the server.
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});

  const clients = useMemo<AdminClient[]>(
    () =>
      initial.map((c) => ({
        ...c,
        email: emailOverrides[c.id] ?? c.email,
        isOnline: online.has(c.id),
      })),
    [initial, online, emailOverrides],
  );

  async function onUpdateEmail(clientId: string, newEmail: string) {
    const res = await fetch(`/api/admin/clients/${clientId}/email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: body.error ?? "Update failed." };
    }
    setEmailOverrides((prev) => ({ ...prev, [clientId]: newEmail }));
    router.refresh();
    return { ok: true as const };
  }

  return (
    <AdminClientsPage
      clients={clients}
      onMessageClient={(id) => {
        router.push(`/admin/clients#${id}`);
      }}
      onViewSiteTickets={(siteId) =>
        router.push(`/admin/tickets?site=${encodeURIComponent(siteId)}`)
      }
      onUpdateEmail={onUpdateEmail}
    />
  );
}
