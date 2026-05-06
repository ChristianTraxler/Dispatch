"use client";

import { useRouter } from "next/navigation";
import { SitesPage, type SiteWithStats } from "@/components/SitesPage";

export function SitesClient({ sites }: { sites: SiteWithStats[] }) {
  const router = useRouter();

  return (
    <SitesPage
      sites={sites}
      onFileTicketFor={(siteId) =>
        router.push(`/portal/ticket/new?site=${encodeURIComponent(siteId)}`)
      }
      onViewTicketsFor={(siteId) =>
        router.push(`/portal/dashboard?site=${encodeURIComponent(siteId)}`)
      }
    />
  );
}
