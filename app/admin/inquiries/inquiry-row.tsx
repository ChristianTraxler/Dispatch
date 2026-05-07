"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";

export interface InquiryRowData {
  id: string;
  clientName: string;
  avatarUrl: string | null;
  preview: string;
  lastSenderTag: string;
  messageCount: number;
  activityIso: string;
}

interface Props {
  row: InquiryRowData;
  onDelete: (id: string) => void;
}

function formatRelative(iso: string): string {
  const value = new Date(iso);
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return value.toLocaleString("en-US", { month: "short", day: "2-digit" });
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function InquiryRow({ row, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push: pushToast } = useToast();
  const router = useRouter();
  const liRef = useRef<HTMLLIElement>(null);

  // Cancel confirm on Esc or click outside the row.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!liRef.current) return;
      if (!liRef.current.contains(e.target as Node)) setConfirming(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [confirming]);

  const startConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(true);
  };

  const cancelConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  };

  const commitDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDelete(row.id);
      // Re-syncs the server-rendered Active (N) / Archived (N) counts in
      // the page header.
      router.refresh();
    } catch (err) {
      console.error("[InquiryRow] delete failed:", err);
      pushToast({
        kind: "error",
        title: "Couldn't delete inquiry",
        detail: "Try again.",
      });
      setConfirming(false);
      setBusy(false);
    }
    // Note: on success we don't reset busy/confirming because the row unmounts.
  };

  const metaSlot = confirming ? (
    <div className="flex items-center gap-1 shrink-0">
      <span className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-mute mr-1">
        Delete?
      </span>
      <button
        type="button"
        onClick={commitDelete}
        disabled={busy}
        className="inline-flex items-center justify-center min-w-[32px] min-h-[32px] text-sm leading-none text-signal-red hover:bg-signal-red/10 active:bg-signal-red/20 rounded disabled:opacity-50 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red focus-visible:ring-offset-1 transition-colors"
        aria-label="Confirm delete"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={cancelConfirm}
        className="inline-flex items-center justify-center min-w-[32px] min-h-[32px] text-sm leading-none text-ink-mute hover:bg-ink/5 hover:text-ink active:bg-ink/10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 transition-colors"
        aria-label="Cancel delete"
      >
        ✗
      </button>
    </div>
  ) : (
    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade text-right shrink-0">
      {row.messageCount} msg{row.messageCount === 1 ? "" : "s"} ·{" "}
      {formatRelative(row.activityIso)}
    </div>
  );

  const inner = (
    <div className="flex items-center gap-4">
      <Avatar
        src={row.avatarUrl}
        name={row.clientName}
        size={40}
        tone="client"
      />
      <div className="flex-1 min-w-0">
        <p className="font-display text-lg text-ink">{row.clientName}</p>
        <p className="font-display italic text-ink-mute text-sm mt-1 truncate">
          <span className="font-mono not-italic text-[0.55rem] uppercase tracking-widest text-ink-fade mr-2">
            {row.lastSenderTag}:
          </span>
          {row.preview}
        </p>
      </div>
      {metaSlot}
      {!confirming && (
        <button
          type="button"
          onClick={startConfirm}
          className="text-ink-mute hover:text-signal-red opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 p-1 -m-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red focus-visible:ring-offset-1"
          aria-label="Delete inquiry"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );

  return (
    <li ref={liRef} className="group">
      {confirming ? (
        <div className="block py-4 px-2">{inner}</div>
      ) : (
        <Link
          href={`/admin/ticket/${row.id}`}
          className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
