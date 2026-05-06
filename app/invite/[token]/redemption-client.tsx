"use client";

import { useRouter } from "next/navigation";
import {
  InviteRedemption,
  type InviteData,
  type InviteState,
} from "@/components/InviteRedemption";

interface Props {
  state: InviteState;
  token: string;
  invite?: InviteData;
  currentSessionEmail?: string;
}

export function InviteRedemptionClient({
  state,
  token,
  invite,
  currentSessionEmail,
}: Props) {
  const router = useRouter();

  async function onSignup({ name, password }: { name: string; password: string }) {
    const res = await fetch("/api/portal/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Could not redeem invite. Try again.");
      return;
    }
    router.push("/portal/dashboard");
    router.refresh();
  }

  async function onLogin({ password }: { password: string }) {
    if (!invite) return;
    const res = await fetch("/api/portal/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: invite.email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Sign-in failed.");
      return;
    }
    // Now signed in. Trigger the merge so the new site is attached.
    const merge = await fetch(`/api/portal/invites/${token}/merge`, {
      method: "POST",
    });
    if (!merge.ok) {
      const body = (await merge.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Sign-in succeeded but the merge failed. Contact support.");
      return;
    }
    router.push("/portal/dashboard");
    router.refresh();
  }

  async function onConfirmMerge() {
    const res = await fetch(`/api/portal/invites/${token}/merge`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Could not attach the site. Try again.");
      return;
    }
    router.push("/portal/dashboard");
    router.refresh();
  }

  async function onSignOut() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <InviteRedemption
      state={state}
      invite={invite}
      currentSessionEmail={currentSessionEmail}
      onSignup={onSignup}
      onLogin={onLogin}
      onConfirmMerge={onConfirmMerge}
      onSignOut={onSignOut}
    />
  );
}
