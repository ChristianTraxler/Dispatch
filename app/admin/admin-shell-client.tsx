"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { ToastProvider, useToast } from "@/components/Toast";
import {
  ClientsPresenceProvider,
  useAdminPresenceTracker,
  useClientsPresence,
  useClientsPresenceDiff,
} from "@/lib/realtime/use-presence";
import { useTicketsFeed } from "@/lib/realtime/use-tickets-feed";

function deriveActiveNav(
  pathname: string,
): "dashboard" | "inquiries" | "clients" | "invites" {
  if (pathname.startsWith("/admin/inquiries")) return "inquiries";
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/invites")) return "invites";
  return "dashboard";
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const { push: pushToast } = useToast();

  useAdminPresenceTracker("Christian");

  const onlineClients = useClientsPresence();

  useClientsPresenceDiff({
    onJoin: (c) => pushToast({ kind: "signin", title: c.name, detail: "signed in" }),
    onLeave: (c) => pushToast({ kind: "signout", title: c.name, detail: "signed out" }),
  });

  useTicketsFeed({
    onInsert: (row) => {
      if (row.is_inquiry) {
        pushToast({
          kind: "info",
          title: "💬 New inquiry",
          detail: row.title || "(no preview)",
        });
      } else {
        pushToast({
          kind: "info",
          title: "New ticket filed",
          detail: row.title,
        });
      }
    },
    onPromotion: (event) => {
      pushToast({
        kind: "info",
        title: "Inquiry promoted to ticket",
        detail: event.title || "(untitled)",
      });
    },
  });

  const [inquiryCount, setInquiryCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/admin/inquiries/count", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { count: number };
          setInquiryCount(data.count);
        }
      } catch {
        /* ignore */
      }
    };
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function onNavigate(
    target: "dashboard" | "inquiries" | "clients" | "invites" | "logout",
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
      inquiryCount={inquiryCount}
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
      <ClientsPresenceProvider>
        <AdminShellInner>{children}</AdminShellInner>
      </ClientsPresenceProvider>
    </ToastProvider>
  );
}
