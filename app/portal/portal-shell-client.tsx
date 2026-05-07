"use client";

import { usePathname, useRouter } from "next/navigation";
import { PortalShell, type PortalUser } from "@/components/PortalShell";
import { BusinessHoursPill } from "@/components/BusinessHoursPill";
import {
  AdminPresenceProvider,
  useClientPresenceTracker,
} from "@/lib/realtime/use-presence";
import { AdminStatusProvider } from "@/lib/realtime/use-admin-status";

function deriveActiveNav(pathname: string): "dashboard" | "sites" | "account" {
  if (pathname.startsWith("/portal/sites")) return "sites";
  if (pathname.startsWith("/portal/account")) return "account";
  return "dashboard";
}

function PortalShellInner({
  user,
  children,
}: {
  user: PortalUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/portal/dashboard";
  const router = useRouter();

  useClientPresenceTracker({
    accountId: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  });

  async function onNavigate(
    target: "dashboard" | "sites" | "account" | "logout" | "new-ticket",
  ) {
    if (target === "logout") {
      await fetch("/api/portal/auth/logout", { method: "POST" });
      router.push("/portal");
      router.refresh();
      return;
    }
    if (target === "new-ticket") {
      router.push("/portal/ticket/new");
      return;
    }
    if (target === "dashboard") router.push("/portal/dashboard");
    else router.push(`/portal/${target}`);
  }

  return (
    <PortalShell
      user={user}
      availabilityPill={<BusinessHoursPill />}
      activeNav={deriveActiveNav(pathname)}
      onNavigate={onNavigate}
    >
      {children}
    </PortalShell>
  );
}

export function PortalShellClient({
  user,
  children,
}: {
  user: PortalUser;
  children: React.ReactNode;
}) {
  return (
    <AdminPresenceProvider>
      <AdminStatusProvider>
        <PortalShellInner user={user}>{children}</PortalShellInner>
      </AdminStatusProvider>
    </AdminPresenceProvider>
  );
}
