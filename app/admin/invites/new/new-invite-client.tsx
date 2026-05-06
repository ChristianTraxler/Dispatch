"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminInviteNewPage,
  type AdminInviteNewSubmission,
} from "@/components/AdminInviteNewPage";

export function NewInviteClient() {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);

  async function onSubmit(data: AdminInviteNewSubmission) {
    setError(undefined);
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not file the invite. Try again.");
      return;
    }
    router.push("/admin/invites");
    router.refresh();
  }

  function onCancel() {
    router.push("/admin/invites");
  }

  return (
    <>
      {error && (
        <div className="max-w-3xl mx-auto px-5 md:px-10 pt-6">
          <div
            role="alert"
            className="border-l-[3px] border-signal-red bg-signal-red/5 px-4 py-3 font-mono text-xs uppercase tracking-wider text-signal-redDeep"
          >
            {error}
          </div>
        </div>
      )}
      <AdminInviteNewPage onSubmit={onSubmit} onCancel={onCancel} />
    </>
  );
}
