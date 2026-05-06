"use client";

import Link from "next/link";
import { useClientsPresenceWatcher } from "@/lib/realtime/use-presence";
import { PresenceDot } from "@/components/PresenceDot";

/**
 * Live list of currently signed-in clients. Renders on the Live Ledger
 * so the admin sees who's online without leaving the dashboard. Driven
 * by the same Realtime Presence channel that feeds the masthead "X live"
 * count and /admin/clients.
 */
export function OnlineClientsPanel() {
  const online = useClientsPresenceWatcher();
  const list = [...online.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border border-rule bg-parchment-warm">
      <div className="flex items-center gap-2 px-4 py-3 rule-thin">
        <PresenceDot
          status={list.length > 0 ? "online" : "offline"}
          pulse={list.length > 0}
        />
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Online Now
        </span>
        <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade">
          {list.length}
        </span>
      </div>

      {list.length === 0 ? (
        <p className="px-4 py-4 font-display italic text-ink-mute text-sm">
          No clients signed in right now.
        </p>
      ) : (
        <ul className="divide-y divide-rule-soft">
          {list.map((c) => (
            <li key={c.accountId} className="px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="presence-dot online pulse"
                  aria-hidden="true"
                />
                <span className="font-display text-sm text-ink truncate">
                  {c.name}
                </span>
              </div>
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade mt-0.5 truncate ml-[17px]">
                {c.email}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 py-2.5 rule-thin border-t border-rule-soft">
        <Link
          href="/admin/clients"
          className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
        >
          Full roster →
        </Link>
      </div>
    </div>
  );
}
