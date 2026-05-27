"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminClientDetail,
  type AdminClientDetailData,
} from "@/components/AdminClientDetail";
import { useClientsPresence } from "@/lib/realtime/use-presence";
import type { FreeWindowStatus } from "@/lib/free-updates";
import {
  AddOnsSection,
  type ActiveRow,
  type CatalogAddOn,
  type ClientSite,
  type Override,
} from "./add-ons-section";

export function ClientDetailClient({
  initial,
  initialFreeWindowStatusBySite,
  addOnsCatalog,
  addOnsOverrides,
  addOnsActive,
  addOnsClientSites,
}: {
  initial: AdminClientDetailData;
  initialFreeWindowStatusBySite: Record<string, FreeWindowStatus>;
  addOnsCatalog: CatalogAddOn[];
  addOnsOverrides: Override[];
  addOnsActive: ActiveRow[];
  addOnsClientSites: ClientSite[];
}) {
  const router = useRouter();
  const online = useClientsPresence();

  const [emailOverride, setEmailOverride] = useState<string | null>(null);

  const client = useMemo<AdminClientDetailData>(() => {
    const presence = online.get(initial.id);
    return {
      ...initial,
      email: emailOverride ?? initial.email,
      isOnline: !!presence,
    };
  }, [initial, online, emailOverride]);

  async function onUpdateEmail(newEmail: string) {
    const res = await fetch(`/api/admin/clients/${initial.id}/email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: body.error ?? "Update failed." };
    }
    setEmailOverride(newEmail);
    router.refresh();
    return { ok: true as const };
  }

  async function onMoveToProduction(siteId: string) {
    const res = await fetch(`/api/admin/sites/${siteId}/production`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: body.error ?? "Update failed." };
    }
    router.refresh();
    return { ok: true as const };
  }

  async function onResetProduction(siteId: string) {
    const res = await fetch(`/api/admin/sites/${siteId}/production`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: body.error ?? "Update failed." };
    }
    router.refresh();
    return { ok: true as const };
  }

  return (
    <>
      <AdminClientDetail
        client={client}
        freeWindowStatusBySite={initialFreeWindowStatusBySite}
        onUpdateEmail={onUpdateEmail}
        onMoveToProduction={onMoveToProduction}
        onResetProduction={onResetProduction}
      />
      <AddOnsSection
        clientId={initial.id}
        catalog={addOnsCatalog}
        overrides={addOnsOverrides}
        active={addOnsActive}
        sites={addOnsClientSites}
      />
    </>
  );
}
