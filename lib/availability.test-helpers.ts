// lib/availability.test-helpers.ts
import {
  computeAvailability,
  type AdminSettingsInput,
  type WeeklyHours,
} from "./availability";

const STD_HOURS: WeeklyHours = {
  "0": { enabled: false },
  "1": { enabled: true, open: "09:00", close: "17:00" },
  "2": { enabled: true, open: "09:00", close: "17:00" },
  "3": { enabled: true, open: "09:00", close: "17:00" },
  "4": { enabled: true, open: "09:00", close: "17:00" },
  "5": { enabled: true, open: "09:00", close: "17:00" },
  "6": { enabled: false },
};

function settings(over: Partial<AdminSettingsInput> = {}): AdminSettingsInput {
  return {
    timezone: "America/New_York",
    hours: STD_HOURS,
    oooEnabled: false,
    oooFrom: null,
    oooUntil: null,
    oooMessage: null,
    holidays: [],
    ...over,
  };
}

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [
  {
    name: "ooo: enabled with no until → ooo state, default detail",
    fn: () => {
      const r = computeAvailability(
        settings({ oooEnabled: true }),
        false,
        new Date("2026-05-12T14:00:00Z"),
      );
      assertEq(r.state, "ooo");
      assertEq(r.label, "Out of office");
      assertContains(r.detail, "office");
    },
  },
  {
    name: "ooo: enabled with custom message → uses custom message",
    fn: () => {
      const r = computeAvailability(
        settings({ oooEnabled: true, oooMessage: "On vacation — back Mon May 18." }),
        true,
        new Date("2026-05-12T14:00:00Z"),
      );
      assertEq(r.state, "ooo");
      assertContains(r.detail, "vacation");
    },
  },
  {
    name: "ooo: oooUntil in the past is ignored, falls through",
    fn: () => {
      const r = computeAvailability(
        settings({
          oooEnabled: true,
          oooUntil: new Date("2026-04-01T00:00:00Z"),
        }),
        false,
        new Date("2026-05-12T14:00:00Z"),
      );
      assertEq(r.state, "available");
    },
  },
  {
    name: "ooo: oooFrom in the future → not yet OOO, falls through to schedule",
    fn: () => {
      const r = computeAvailability(
        settings({
          oooEnabled: true,
          oooFrom: new Date("2026-05-20T13:00:00Z"), // 9am ET on May 20
        }),
        false,
        new Date("2026-05-12T14:00:00Z"), // Tue 10am ET, before window
      );
      assertEq(r.state, "available");
    },
  },
  {
    name: "ooo: now inside [oooFrom, oooUntil) window → ooo active",
    fn: () => {
      const r = computeAvailability(
        settings({
          oooEnabled: true,
          oooFrom: new Date("2026-05-10T00:00:00Z"),
          oooUntil: new Date("2026-05-20T00:00:00Z"),
        }),
        true, // even if presence is online, OOO wins inside the window
        new Date("2026-05-12T14:00:00Z"),
      );
      assertEq(r.state, "ooo");
    },
  },
  {
    name: "online: admin presence beats schedule",
    fn: () => {
      const r = computeAvailability(
        settings(),
        true,
        new Date("2026-05-13T03:00:00Z"),
      );
      assertEq(r.state, "online");
      assertEq(r.label, "Online");
    },
  },
  {
    name: "available: within hours and not online",
    fn: () => {
      const r = computeAvailability(
        settings(),
        false,
        new Date("2026-05-12T14:00:00Z"),
      );
      assertEq(r.state, "available");
    },
  },
  {
    name: "offline: outside hours on weekday → next open at next morning",
    fn: () => {
      const r = computeAvailability(
        settings(),
        false,
        new Date("2026-05-13T03:00:00Z"),
      );
      assertEq(r.state, "offline");
      assertEq(r.nextOpenAt, "2026-05-13T13:00:00.000Z");
    },
  },
  {
    name: "offline: Saturday → next open is Monday",
    fn: () => {
      const r = computeAvailability(
        settings(),
        false,
        new Date("2026-05-09T15:00:00Z"),
      );
      assertEq(r.state, "offline");
      assertEq(r.nextOpenAt, "2026-05-11T13:00:00.000Z");
    },
  },
  {
    name: "offline: before today's open window → next open is today",
    fn: () => {
      const r = computeAvailability(
        settings(),
        false,
        new Date("2026-05-12T11:00:00Z"),
      );
      assertEq(r.state, "offline");
      assertEq(r.nextOpenAt, "2026-05-12T13:00:00.000Z");
    },
  },
  {
    name: "offline: all days disabled → nextOpenAt null",
    fn: () => {
      const allOff: WeeklyHours = {
        "0": { enabled: false }, "1": { enabled: false }, "2": { enabled: false },
        "3": { enabled: false }, "4": { enabled: false }, "5": { enabled: false },
        "6": { enabled: false },
      };
      const r = computeAvailability(
        settings({ hours: allOff }),
        false,
        new Date("2026-05-12T14:00:00Z"),
      );
      assertEq(r.state, "offline");
      assertEq(r.nextOpenAt, null);
    },
  },
];

export function runChecks(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
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
function assertContains(actual: string, needle: string) {
  if (!actual.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`expected "${actual}" to contain "${needle}"`);
  }
}
