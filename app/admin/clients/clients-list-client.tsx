"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AdminClientsPage,
  type AdminClient,
} from "@/components/AdminClientsPage";
import { useClientsPresenceWatcher } from "@/lib/realtime/use-presence";

export function ClientsListClient({ initial }: { initial: AdminClient[] }) {
  const router = useRouter();
  const online = useClientsPresenceWatcher();

  const clients = useMemo<AdminClient[]>(
    () =>
      initial.map((c) => ({
        ...c,
        isOnline: online.has(c.id),
      })),
    [initial, online],
  );

  return (
    <AdminClientsPage
      clients={clients}
      onMessageClient={(id) => {
        // No "DM the client" inbox yet — for now, scroll the admin to the
        // client's most recent ticket as a stand-in. Phase 11+ may flesh this out.
        router.push(`/admin/clients#${id}`);
      }}
      onViewSiteTickets={(siteId) =>
        router.push(`/admin/tickets?site=${encodeURIComponent(siteId)}`)
      }
    />
  );
}
