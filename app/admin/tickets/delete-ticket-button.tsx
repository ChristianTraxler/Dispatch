"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        // 404 means it's already gone — refresh so the stale row disappears.
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
      className="shrink-0 px-3 py-2 -mr-2 text-ink-mute hover:text-signal-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red focus-visible:ring-offset-1"
      title="Delete ticket (testing)"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  );
}
