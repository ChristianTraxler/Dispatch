"use client";

import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  useAdminPresenceTracker,
  useClientsPresenceWatcher,
} from "@/lib/realtime/use-presence";

function deriveActiveNav(
  pathname: string,
): "dashboard" | "clients" | "invites" {
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/invites")) return "invites";
  return "dashboard";
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const { push: pushToast } = useToast();

  // Announce admin presence + watch for client joins/leaves.
  useAdminPresenceTracker("Christian");
  const onlineClients = useClientsPresenceWatcher({
    onJoin: (c) => pushToast({ kind: "signin", title: c.name, detail: "signed in" }),
    onLeave: (c) => pushToast({ kind: "signout", title: c.name, detail: "signed out" }),
  });

  async function onNavigate(
    target: "dashboard" | "clients" | "invites" | "logout",
  ) {
    if (target === "logout") {
      await fetch("/api/portal/auth/logout", { method: "POST" });
      router.push("/portal");
      router.refresh();
      return;
    }
    if (target === "dashboard") router.push("/admin");
    else router.push(`/admin/${target}`);
  }

  return (
    <AdminShell
      activeNav={deriveActiveNav(pathname)}
      onNavigate={onNavigate}
      onlineClientCount={onlineClients.size}
    >
      {children}
    </AdminShell>
  );
}

export function AdminShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </ToastProvider>
  );
}
