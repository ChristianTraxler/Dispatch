import {
  todayInTimezone,
  parseYmd,
  formatYmd,
  daysInRange,
  isInAnyRange,
  formatDateRange,
  buildMonthGrid,
} from "./vacation-helpers";

interface Case { name: string; fn: () => void; }

const cases: Case[] = [
  {
    name: "todayInTimezone: 03:00 UTC in NY is the previous calendar day",
    fn: () => {
      // 2026-05-09 03:00Z = 2026-05-08 23:00 ET
      const r = todayInTimezone("America/New_York", new Date("2026-05-09T03:00:00Z"));
      assertEq(r, "2026-05-08");
    },
  },
  {
    name: "todayInTimezone: 13:00 UTC in NY is the same calendar day",
    fn: () => {
      // 2026-05-09 13:00Z = 2026-05-09 09:00 ET (during EDT)
      const r = todayInTimezone("America/New_York", new Date("2026-05-09T13:00:00Z"));
      assertEq(r, "2026-05-09");
    },
  },
  {
    name: "todayInTimezone: spring-forward Sunday in NY (2026-03-08)",
    fn: () => {
      // 2026-03-08 04:05Z = 2026-03-07 23:05 EST (DST starts at 02:00 local)
      const r = todayInTimezone("America/New_York", new Date("2026-03-08T04:05:00Z"));
      assertEq(r, "2026-03-07");
      // 2026-03-08 06:05Z = 2026-03-08 01:05 EST (DST flip is at 07:00Z = 02:00 local → 03:00 local)
      const r2 = todayInTimezone("America/New_York", new Date("2026-03-08T06:05:00Z"));
      assertEq(r2, "2026-03-08");
      // 2026-03-08 08:05Z = 2026-03-08 04:05 EDT (after the spring-forward boundary)
      const r3 = todayInTimezone("America/New_York", new Date("2026-03-08T08:05:00Z"));
      assertEq(r3, "2026-03-08");
    },
  },
  {
    name: "parseYmd: well-formed",
    fn: () => {
      const r = parseYmd("2026-06-15");
      assertEq(JSON.stringify(r), JSON.stringify([2026, 6, 15]));
    },
  },
  {
    name: "parseYmd: rejects bad shape",
    fn: () => {
      assertEq(parseYmd("2026/06/15"), null);
      assertEq(parseYmd("2026-6-15"), null);
      assertEq(parseYmd("not a date"), null);
    },
  },
  {
    name: "parseYmd: rejects fake calendar dates",
    fn: () => {
      assertEq(parseYmd("2026-02-30"), null);
      assertEq(parseYmd("2026-13-01"), null);
      assertEq(parseYmd("2026-04-31"), null);
    },
  },
  {
    name: "formatYmd: zero-pads",
    fn: () => {
      assertEq(formatYmd(2026, 6, 5), "2026-06-05");
      assertEq(formatYmd(2026, 12, 31), "2026-12-31");
    },
  },
  {
    name: "daysInRange: 8 days inclusive",
    fn: () => {
      const r = daysInRange("2026-06-15", "2026-06-22");
      assertEq(r.length, 8);
      assertEq(r[0], "2026-06-15");
      assertEq(r[7], "2026-06-22");
    },
  },
  {
    name: "daysInRange: same-day range returns one day",
    fn: () => {
      const r = daysInRange("2026-06-15", "2026-06-15");
      assertEq(JSON.stringify(r), JSON.stringify(["2026-06-15"]));
    },
  },
  {
    name: "daysInRange: crosses month boundary",
    fn: () => {
      const r = daysInRange("2026-06-29", "2026-07-02");
      assertEq(JSON.stringify(r), JSON.stringify([
        "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
      ]));
    },
  },
  {
    name: "daysInRange: end before start returns empty",
    fn: () => {
      assertEq(daysInRange("2026-06-15", "2026-06-14").length, 0);
    },
  },
  {
    name: "isInAnyRange: inside one range",
    fn: () => {
      assertEq(
        isInAnyRange("2026-06-18", [{ startDate: "2026-06-15", endDate: "2026-06-22" }]),
        true,
      );
    },
  },
  {
    name: "isInAnyRange: on boundary (start)",
    fn: () => {
      assertEq(
        isInAnyRange("2026-06-15", [{ startDate: "2026-06-15", endDate: "2026-06-22" }]),
        true,
      );
    },
  },
  {
    name: "isInAnyRange: on boundary (end)",
    fn: () => {
      assertEq(
        isInAnyRange("2026-06-22", [{ startDate: "2026-06-15", endDate: "2026-06-22" }]),
        true,
      );
    },
  },
  {
    name: "isInAnyRange: outside",
    fn: () => {
      assertEq(
        isInAnyRange("2026-06-23", [{ startDate: "2026-06-15", endDate: "2026-06-22" }]),
        false,
      );
    },
  },
  {
    name: "isInAnyRange: multi-range",
    fn: () => {
      const ranges = [
        { startDate: "2026-06-15", endDate: "2026-06-22" },
        { startDate: "2026-08-03", endDate: "2026-08-10" },
      ];
      assertEq(isInAnyRange("2026-08-05", ranges), true);
      assertEq(isInAnyRange("2026-07-15", ranges), false);
    },
  },
  {
    name: "formatDateRange: same month",
    fn: () => {
      assertEq(formatDateRange("2026-06-15", "2026-06-22"), "Jun 15 – Jun 22, 2026");
    },
  },
  {
    name: "formatDateRange: cross-month, same year",
    fn: () => {
      assertEq(formatDateRange("2026-06-29", "2026-07-04"), "Jun 29 – Jul 4, 2026");
    },
  },
  {
    name: "formatDateRange: cross-year",
    fn: () => {
      assertEq(formatDateRange("2026-12-30", "2027-01-03"), "Dec 30, 2026 – Jan 3, 2027");
    },
  },
  {
    name: "formatDateRange: same day",
    fn: () => {
      assertEq(formatDateRange("2026-06-15", "2026-06-15"), "Jun 15, 2026");
    },
  },
  {
    name: "buildMonthGrid: May 2026 starts Friday, has 31 days",
    fn: () => {
      const g = buildMonthGrid(2026, 5, "2026-05-08");
      // Row 0: Sun Apr 26..Sat May 2 (so 5 leading sibling-month days)
      assertEq(g[0]!.length, 7);
      assertEq(g[0]![0]!.date, "2026-04-26");
      assertEq(g[0]![0]!.inMonth, false);
      assertEq(g[0]![5]!.date, "2026-05-01");
      assertEq(g[0]![5]!.inMonth, true);
      // Find the cell for 2026-05-08 — should be marked isToday
      const flat = g.flat();
      const cellToday = flat.find((c) => c.date === "2026-05-08")!;
      assertEq(cellToday.isToday, true);
      assertEq(cellToday.isPast, false);
      // 2026-05-07 is past
      const cellYesterday = flat.find((c) => c.date === "2026-05-07")!;
      assertEq(cellYesterday.isPast, true);
      assertEq(cellYesterday.isToday, false);
    },
  },
  {
    name: "buildMonthGrid: drops empty trailing weeks",
    fn: () => {
      // Feb 2026 starts Sunday, 28 days → exactly 4 weeks, no trailing week needed.
      const g = buildMonthGrid(2026, 2, "2026-05-08");
      assertEq(g.length, 4);
      assertEq(g[0]![0]!.date, "2026-02-01");
      assertEq(g[3]![6]!.date, "2026-02-28");
    },
  },
];

export function runChecks(): { passed: number; failed: number } {
  let passed = 0; let failed = 0;
  for (const c of cases) {
    try {
      c.fn();
      console.log(`  ✓ ${c.name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${c.name}`);
      console.log(`      ${(err as Error).message}`);
      failed++;
    }
  }
  return { passed, failed };
}

function assertEq<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}
