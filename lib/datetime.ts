/**
 * Our timestamp columns (messages.created_at, messages.read_at, …) are Postgres
 * `timestamp` WITHOUT time zone, stored in UTC. The server paths serialize them
 * with `.toISOString()`, so they carry a trailing `Z`. Supabase Realtime,
 * however, forwards the raw column value with no zone designator
 * (e.g. "2026-06-17T23:24:00" or "2026-06-17 23:24:00"). `new Date()` parses an
 * offset-less datetime as *local* time, which displays the clock wrong by the
 * viewer's UTC offset until an SSR refresh re-serializes with `Z`.
 *
 * `ensureUtcIso` makes an offset-less timestamp explicit UTC so every code path
 * (SSR, send-API response, Realtime) agrees. Strings that already carry a zone
 * (`Z` or `±hh:mm`) are returned untouched.
 */
const HAS_ZONE = /([zZ]|[+-]\d{2}:?\d{2})$/;

export function ensureUtcIso(value: string): string;
export function ensureUtcIso(value: string | null): string | null;
export function ensureUtcIso(value: string | null): string | null {
  if (!value) return value;
  if (HAS_ZONE.test(value)) return value;
  return `${value.replace(" ", "T")}Z`;
}

/**
 * Absolute "filed on" stamp — e.g. "Aug 27, 2026 at 3:42 PM".
 *
 * Pass `timeZone` when formatting on the server: without it Node formats in the
 * deploy region's clock (UTC on Vercel), which is hours off from the admin's
 * real day. Client components can omit it and get the viewer's own zone, the
 * same way the status timeline stamps its stages.
 */
export function formatFiledAt(
  value: string | Date | null | undefined,
  timeZone?: string,
): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(ensureUtcIso(value)) : value;
  if (isNaN(d.getTime())) return null;
  // Built from two calls rather than one toLocaleString: the connector between
  // date and time ("Aug 27, 2026, 3:42 PM" vs "…at 3:42 PM") varies by ICU
  // version, so Node and the browser would disagree on the wording.
  const zone = timeZone ? { timeZone } : {};
  const date = d.toLocaleDateString("en-US", {
    ...zone,
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    ...zone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}
