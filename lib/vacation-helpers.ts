export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface MonthCell {
  date: string;
  inMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  weekday: number;
}

export function todayInTimezone(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  // en-CA returns "YYYY-MM-DD" directly.
  return fmt.format(now);
}

export function parseYmd(s: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Round-trip validation: catches Feb 30, Apr 31, etc.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return [y, mo, d];
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInRange(startYmd: string, endYmd: string): string[] {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return [];
  const startUtc = Date.UTC(start[0], start[1] - 1, start[2]);
  const endUtc = Date.UTC(end[0], end[1] - 1, end[2]);
  if (endUtc < startUtc) return [];
  const out: string[] = [];
  for (let t = startUtc; t <= endUtc; t += 86_400_000) {
    const d = new Date(t);
    out.push(formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  }
  return out;
}

export function isInAnyRange(dayYmd: string, ranges: DateRange[]): boolean {
  for (const r of ranges) {
    if (dayYmd >= r.startDate && dayYmd <= r.endDate) return true;
  }
  return false;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDateRange(startYmd: string, endYmd: string): string {
  const s = parseYmd(startYmd); const e = parseYmd(endYmd);
  if (!s || !e) return `${startYmd} – ${endYmd}`;
  if (startYmd === endYmd) return `${MONTH_SHORT[s[1] - 1]} ${s[2]}, ${s[0]}`;
  if (s[0] !== e[0]) {
    return `${MONTH_SHORT[s[1] - 1]} ${s[2]}, ${s[0]} – ${MONTH_SHORT[e[1] - 1]} ${e[2]}, ${e[0]}`;
  }
  if (s[1] !== e[1]) {
    return `${MONTH_SHORT[s[1] - 1]} ${s[2]} – ${MONTH_SHORT[e[1] - 1]} ${e[2]}, ${s[0]}`;
  }
  return `${MONTH_SHORT[s[1] - 1]} ${s[2]} – ${MONTH_SHORT[e[1] - 1]} ${e[2]}, ${s[0]}`;
}

export function buildMonthGrid(
  year: number, monthOneBased: number, todayYmd: string,
): MonthCell[][] {
  // First day of the month, in UTC (we're working with calendar dates only).
  const firstUtc = Date.UTC(year, monthOneBased - 1, 1);
  const firstWeekday = new Date(firstUtc).getUTCDay(); // 0=Sun..6=Sat
  const lastDay = new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();

  // Start at the Sunday on or before the 1st.
  const gridStart = firstUtc - firstWeekday * 86_400_000;
  const lastUtc = Date.UTC(year, monthOneBased - 1, lastDay);
  const lastWeekday = new Date(lastUtc).getUTCDay();
  const gridEnd = lastUtc + (6 - lastWeekday) * 86_400_000;

  const rows: MonthCell[][] = [];
  let row: MonthCell[] = [];
  for (let t = gridStart; t <= gridEnd; t += 86_400_000) {
    const d = new Date(t);
    const date = formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const cell: MonthCell = {
      date,
      inMonth: d.getUTCMonth() + 1 === monthOneBased && d.getUTCFullYear() === year,
      isPast: date < todayYmd,
      isToday: date === todayYmd,
      weekday: d.getUTCDay(),
    };
    row.push(cell);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  // (The construction above always produces complete weeks.)
  return rows;
}
