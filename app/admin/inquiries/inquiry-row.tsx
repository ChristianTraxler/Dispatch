"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";

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

export function InquiryRow({ row }: Props) {
  return (
    <li>
      <Link
        href={`/admin/ticket/${row.id}`}
        className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
      >
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
          <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade text-right shrink-0">
            {row.messageCount} msg{row.messageCount === 1 ? "" : "s"} ·{" "}
            {formatRelative(row.activityIso)}
          </div>
        </div>
      </Link>
    </li>
  );
}
