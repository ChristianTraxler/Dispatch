// Shared Docket pieces for admin pages. Presentation only.

import Link from "next/link";
import type { ReactNode } from "react";
import { TrashIcon } from "./docket-icons";

/** Eyebrow, display title, sub-line and an optional primary action. */
export function PageHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="dk-head">
      <div className="dk-txt">
        <span className="dk-k">{eyebrow}</span>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Mono section label inside or above a card, with optional right meta. */
export function SectionLabel({
  children,
  meta,
  hot = false,
  className = "",
}: {
  children: ReactNode;
  meta?: ReactNode;
  hot?: boolean;
  className?: string;
}) {
  return (
    <div className={`dk-slab ${className}`}>
      <span className={hot ? "dk-hot" : undefined}>{children}</span>
      {meta != null && <span>{meta}</span>}
    </div>
  );
}

/** Month-and-day parts for a stub's tear-off, in the desk's zone. */
export function stubDateParts(value: Date, timeZone: string) {
  return {
    month: value.toLocaleString("en-US", { timeZone, month: "short" }),
    day: value.toLocaleString("en-US", { timeZone, day: "2-digit" }),
    group: value.toLocaleString("en-US", { timeZone, month: "long", year: "numeric" }),
  };
}

/** Groups items (already newest first) under "October 2026"-style headings. */
export function groupByMonth<T>(items: T[], dateOf: (item: T) => Date, timeZone: string) {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = stubDateParts(dateOf(item), timeZone).group;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * A perforated ticket stub. The title link stretches over the whole card;
 * `trash` sits above it with its own click.
 */
export function TicketStub({
  href,
  date,
  timeZone,
  top,
  title,
  by,
  when,
  trash,
}: {
  href: string;
  date: Date;
  timeZone: string;
  top: ReactNode;
  title: ReactNode;
  by: ReactNode;
  when: ReactNode;
  trash?: ReactNode;
}) {
  const { month, day } = stubDateParts(date, timeZone);
  return (
    <article className="dk-stub">
      <div className="dk-date" aria-hidden="true">
        <small>{month}</small>
        <b>{day}</b>
      </div>
      <div className="dk-body">
        <div className="dk-txt">
          <div className="dk-top">{top}</div>
          <h3>
            <Link href={href}>{title}</Link>
          </h3>
          <div className="dk-by">{by}</div>
        </div>
        <div className="dk-aside">
          <div className="dk-when">{when}</div>
          {trash}
        </div>
      </div>
    </article>
  );
}

export { TrashIcon };
