"use client";

import Link from "next/link";
import { useClientsPresence } from "@/lib/realtime/use-presence";
import { PresenceDot } from "@/components/PresenceDot";
import { Avatar } from "@/components/Avatar";

/**
 * Live list of currently signed-in clients. Renders on the Live Ledger
 * so the admin sees who's online without leaving the dashboard. Driven
 * by the same Realtime Presence channel that feeds the masthead "X live"
 * count and /admin/clients.
 */
export function OnlineClientsPanel() {
  const online = useClientsPresence();
  const list = [...online.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dk-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-rule-soft">
        <PresenceDot
          status={list.length > 0 ? "online" : "offline"}
          pulse={list.length > 0}
        />
        <span className="dk-slab">
          Online Now
        </span>
        <span className="ml-auto dk-mono text-[0.75rem] text-ink-mute">
          {list.length}
        </span>
      </div>

      {list.length === 0 ? (
        <p className="px-5 py-4 text-ink-mute text-sm">
          No clients signed in right now.
        </p>
      ) : (
        <ul className="divide-y divide-rule-soft">
          {list.map((c) => (
            <li key={c.accountId} className="px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={c.avatarUrl ?? null} name={c.name} size={32} tone="client" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-ink truncate">{c.name}</p>
                  <p className="text-[0.8125rem] text-ink-soft truncate">
                    {c.email}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="px-5 py-3 border-t border-rule-soft">
        <Link
          href="/admin/clients"
          className="dk-link"
        >
          Full roster →
        </Link>
      </div>
    </div>
  );
}
