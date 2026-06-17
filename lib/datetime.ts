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
