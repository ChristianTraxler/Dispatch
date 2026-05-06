"use client";

import { useRouter } from "next/navigation";
import {
  DashboardPage,
  type DashboardSite,
  type DashboardTicket,
} from "@/components/DashboardPage";

export function DashboardClient({
  tickets,
  sites,
}: {
  tickets: DashboardTicket[];
  sites: DashboardSite[];
}) {
  const router = useRouter();

  return (
    <DashboardPage
      tickets={tickets}
      sites={sites}
      onOpenTicket={(id) => router.push(`/portal/ticket/${id}`)}
      onNewTicket={() => router.push("/portal/ticket/new")}
    />
  );
}
