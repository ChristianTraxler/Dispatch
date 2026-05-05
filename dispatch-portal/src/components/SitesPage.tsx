"use client";

import { type CSSProperties } from "react";

export interface SiteWithStats {
  id: string;
  url: string;
  displayName: string;
  addedAt: string | Date;
  totalTickets: number;
  openTickets: number;
}

export interface SitesPageProps {
  sites: SiteWithStats[];
  onFileTicketFor?: (siteId: string) => void;
  onViewTicketsFor?: (siteId: string) => void;
  className?: string;
  style?: CSSProperties;
}

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function SitesPage({
  sites,
  onFileTicketFor,
  onViewTicketsFor,
  className = "",
  style,
}: SitesPageProps) {
  return (
    <div className={`max-w-5xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Registered Sites
        </span>
      </div>
      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-2"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Your sites
      </h1>
      <p className="font-display italic text-ink-mute mb-8 text-base">
        Every website attached to your account. Tickets you file are bound to one
        of these.
      </p>

      <div className="rule-double">
        {sites.map((site, i) => (
          <div
            key={site.id}
            className={[
              "py-6 flex flex-col md:flex-row md:items-center gap-4",
              i < sites.length - 1 ? "border-b border-ruleSoft" : "",
            ].join(" ")}
          >
            {/* Site identity */}
            <div className="flex-1 min-w-0">
              <h2
                className="font-display text-xl md:text-2xl leading-tight"
                style={{ fontVariationSettings: '"opsz" 144' }}
              >
                {site.displayName}
              </h2>
              <a
                href={`https://${site.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs uppercase tracking-wider text-ink-mute hover:text-signal-red transition-colors inline-flex items-center gap-1.5 mt-1"
              >
                {site.url} ↗
              </a>
              <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade mt-2">
                Added {formatDate(site.addedAt)}
              </div>
            </div>

            {/* Stats */}
            <div className="flex md:flex-col md:items-end gap-4 md:gap-1 md:text-right">
              <div>
                <div className="font-display text-2xl text-ink leading-none">
                  {site.totalTickets}
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
                  Total filed
                </div>
              </div>
              <div>
                <div
                  className={[
                    "font-display text-2xl leading-none",
                    site.openTickets > 0 ? "text-signal-red" : "text-ink-fade",
                  ].join(" ")}
                >
                  {site.openTickets}
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-1">
                  Currently open
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 md:items-stretch md:w-[180px] flex-shrink-0">
              <button
                type="button"
                onClick={() => onFileTicketFor?.(site.id)}
                className="btn-dispatch"
              >
                File a ticket
              </button>
              {site.totalTickets > 0 && (
                <button
                  type="button"
                  onClick={() => onViewTicketsFor?.(site.id)}
                  className="btn-ghost"
                >
                  View {site.totalTickets} ticket{site.totalTickets === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {sites.length === 0 && (
        <div className="text-center py-16">
          <p className="font-display italic text-ink-mute">
            No sites yet. Wait for an invite from Christian to add one.
          </p>
        </div>
      )}
    </div>
  );
}
