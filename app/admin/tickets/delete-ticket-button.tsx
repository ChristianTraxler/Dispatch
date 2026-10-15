"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "../docket-icons";

type Props = {
  id: string;
  label: string;
};

export function DeleteTicketButton({ id, label }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    if (!window.confirm(`Delete ticket ${label}? This cannot be undone.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          // body wasn't JSON; keep the HTTP status fallback
        }
        window.alert(`Couldn't delete ticket: ${detail}`);
        // 404 means it's already gone, refresh so the stale row disappears.
        if (res.status === 404) router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[DeleteTicketButton] delete failed:", err);
      window.alert("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`Delete ticket ${label}`}
      className="dk-trash disabled:opacity-40 disabled:cursor-not-allowed"
      title="Delete ticket (testing)"
    >
      <TrashIcon />
    </button>
  );
}
