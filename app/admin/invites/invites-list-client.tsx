"use client";

import { useRouter } from "next/navigation";
import {
  AdminInvitesPage,
  type AdminInvite,
} from "@/components/AdminInvitesPage";

export function InvitesListClient({ invites }: { invites: AdminInvite[] }) {
  const router = useRouter();

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
