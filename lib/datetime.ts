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

/**
 * Every displayed timestamp is formatted in this zone rather than the
 * viewer's. Two reasons, and both matter:
 *
 *   1. Dispatch is one desk on the US East Coast — "3:42 PM" should mean the
 *      desk's clock, the same clock AdminSettings.timezone defaults to.
 *   2. A viewer-local format is not deterministic across the SSR boundary.
 *      Vercel runs UTC, so the server renders one string and the browser
 *      another; React 19 treats that text mismatch as a hydration failure and
 *      recovers by discarding the server-rendered tree and re-rendering the
 *      whole page on the client. A fixed zone renders identically on both
 *      sides, so the question never arises.
 *
 * Naming the IANA zone rather than a fixed -05:00 keeps DST correct.
 */
export const DISPLAY_TIME_ZONE = "America/New_York";

/** Calendar day (YYYY-MM-DD) as seen from the display zone. */
export function zonedDayKey(
  value: Date,
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  return value.toLocaleDateString("en-CA", { timeZone });
}

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
 * Defaults to DISPLAY_TIME_ZONE, so server and client produce the same string
 * and both show the desk's clock. Pass `timeZone` to override with the
 * admin's configured zone where it is available.
 */
export function formatFiledAt(
  value: string | Date | null | undefined,
  timeZone: string = DISPLAY_TIME_ZONE,
): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(ensureUtcIso(value)) : value;
  if (isNaN(d.getTime())) return null;
  // Built from two calls rather than one toLocaleString: the connector between
  // date and time ("Aug 27, 2026, 3:42 PM" vs "…at 3:42 PM") varies by ICU
  // version, so Node and the browser would disagree on the wording.
  const zone = { timeZone };
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
