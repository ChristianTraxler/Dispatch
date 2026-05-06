"use client";

import { useRouter } from "next/navigation";
import {
  AdminInvitesPage,
  type AdminInvite,
} from "@/components/AdminInvitesPage";
import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

export function InvitesListClient({ invites }: { invites: AdminInvite[] }) {
  const router = useRouter();

  // Live-update on any invite change — created, redeemed, revoked, expired.
  useRealtimeRefresh({ table: "invites" });

  function onCreateInvite() {
    router.push("/admin/invites/new");
  }

  async function onRevoke(inviteId: string) {
    const res = await fetch(`/api/admin/invites/${inviteId}`, {
      method: "DELETE",
    });
    if (res.ok) router.refresh();
  }

  async function onCopyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API requires HTTPS or localhost; silently no-op otherwise
    }
  }

  return (
    <AdminInvitesPage
      invites={invites}
      onCreateInvite={onCreateInvite}
      onRevoke={onRevoke}
      onCopyLink={onCopyLink}
    />
  );
}
