# Pull-to-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pull-to-refresh gesture inside the authenticated shells (`AdminShell`, `PortalShell`) so PWA users can refresh by pulling down — short pull = `router.refresh()`, long pull = full reload.

**Architecture:** A single client component `components/PullToRefresh.tsx` that wraps its children, attaches `document`-level touch listeners, and renders a fixed circular indicator at the top of the viewport. The component is mounted once inside each shell's `<main>`. No third-party dependency. No test runner exists in this project; verification is manual on real devices.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS. `useRouter` from `next/navigation` for soft refresh.

**Spec:** `docs/superpowers/specs/2026-05-07-pull-to-refresh-design.md`

**Important note on testing:** This project has no test runner. Per the spec, this gesture has no useful unit-test surface — it's a touch-event driven UI feature. Each task's verification is a manual smoke test you run yourself in the browser (Chrome DevTools mobile emulation is fine for early tasks; real iOS/Android devices for Task 7). The "test" in TDD parlance is the manual verification described in each task — treat it as a hard gate before committing.

**Next.js 16 caveat:** Per `AGENTS.md`, this project uses Next.js 16 which has breaking changes from older versions. Before writing the code, do a quick sanity check that `useRouter().refresh()` from `next/navigation` still exists in Next 16 (Task 1, Step 0).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `components/PullToRefresh.tsx` | Create | Self-contained client component. Owns gesture state, touch listeners, indicator UI, refresh dispatch. Single export, single responsibility. |
| `components/AdminShell.tsx` | Modify | Wrap `{children}` inside `<main>` with `<PullToRefresh>`. One added import + one wrapper. |
| `components/PortalShell.tsx` | Modify | Same change as AdminShell. |

That's it. The plan does not touch `app/layout.tsx`, `app/auth/*`, `app/invite/*`, or any other file. This is by design — the gesture only exists inside the two authenticated shells.

---

## Task 1: Create the no-op skeleton component

**Files:**
- Create: `components/PullToRefresh.tsx`

- [ ] **Step 0: Verify Next.js 16 still exports `useRouter().refresh()`**

The project's `AGENTS.md` warns that Next.js 16 may have breaking changes. Before writing any code, confirm the API exists.

Run: `grep -r "refresh" node_modules/next/dist/docs/02-app/02-api-reference/04-functions/use-router.mdx 2>/dev/null | head -5` (path may vary).

If that file doesn't exist, run: `find node_modules/next/dist/docs -name "use-router*" -type f`

Expected: A doc file exists and mentions `router.refresh()` as a method on the returned router object. If it does not — STOP and surface this to the user before continuing; the rest of the plan assumes `router.refresh()` works.

- [ ] **Step 1: Write the skeleton**

Create `components/PullToRefresh.tsx` with this exact content:

```tsx
"use client";

import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function PullToRefresh({ children }: Props) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Verify the file typechecks**

Run: `npx tsc --noEmit`
Expected: No errors related to `PullToRefresh.tsx`. (Pre-existing errors in unrelated files are OK; just confirm none point at the new file.)

- [ ] **Step 3: Commit**

```bash
git add components/PullToRefresh.tsx
git commit -m "feat(ptr): scaffold no-op PullToRefresh component"
```

---

## Task 2: Wire into AdminShell and PortalShell

**Files:**
- Modify: `components/AdminShell.tsx` (add import; wrap children at line 111)
- Modify: `components/PortalShell.tsx` (add import; wrap children at line 106)

- [ ] **Step 1: Add the import to AdminShell.tsx**

In `components/AdminShell.tsx`, find the existing imports (lines 3–5):

```tsx
import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import { PresenceDot } from "./PresenceDot";
```

Add a fourth import directly below them:

```tsx
import { PullToRefresh } from "./PullToRefresh";
```

- [ ] **Step 2: Wrap children in AdminShell.tsx**

Find this line (around line 111):

```tsx
      <main className="flex-1">{children}</main>
```

Replace it with:

```tsx
      <main className="flex-1">
        <PullToRefresh>{children}</PullToRefresh>
      </main>
```

- [ ] **Step 3: Add the import to PortalShell.tsx**

In `components/PortalShell.tsx`, find the existing imports (lines 3–5):

```tsx
import { type ReactNode } from "react";
import { Masthead } from "./Masthead";
import { PresenceDot } from "./PresenceDot";
```

Add a fourth import directly below them:

```tsx
import { PullToRefresh } from "./PullToRefresh";
```

- [ ] **Step 4: Wrap children in PortalShell.tsx**

Find this line (around line 106):

```tsx
      <main className="flex-1">{children}</main>
```

Replace it with:

```tsx
      <main className="flex-1">
        <PullToRefresh>{children}</PullToRefresh>
      </main>
```

- [ ] **Step 5: Manual verify — app still renders normally**

Run: `npm run dev`

Then in a browser:
- Visit an admin page (e.g. `/admin`) → should render exactly as before, no visible change.
- Visit a portal page (e.g. `/portal`) → same.
- Open DevTools → Console → no new errors.
- Auth pages (`/auth/login`) → render exactly as before (they don't go through a shell, so the wrapper isn't there).

Expected: zero visual or behavioral change. The wrapper is a no-op pass-through right now.

- [ ] **Step 6: Commit**

```bash
git add components/AdminShell.tsx components/PortalShell.tsx
git commit -m "feat(ptr): mount PullToRefresh in admin and portal shells"
```

---

## Task 3: Add touch tracking with activation gate (no UI yet)

This task adds the gesture detection logic but no visual indicator. Verification is via `console.log` so you can confirm the gate accepts/rejects touches correctly before adding visuals.

**Files:**
- Modify: `components/PullToRefresh.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `components/PullToRefresh.tsx` with:

```tsx
"use client";

import { type ReactNode, useEffect } from "react";

interface Props {
  children: ReactNode;
}

function isInteractiveTarget(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node) {
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

function isInsideScrolledContainer(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollTop > 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function PullToRefresh({ children }: Props) {
  useEffect(() => {
    let tracking = false;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (window.scrollY !== 0) return;
      if (isInteractiveTarget(e.target)) return;
      if (isInsideScrolledContainer(e.target)) return;

      tracking = true;
      startY = e.touches[0].clientY;
      console.log("[ptr] tracking started");
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        tracking = false;
        return;
      }
      e.preventDefault();
      console.log("[ptr] delta", Math.round(delta));
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      console.log("[ptr] released");
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `PullToRefresh.tsx`.

- [ ] **Step 3: Manual verify — gate logic in DevTools mobile emulation**

Run: `npm run dev`

Open Chrome → DevTools → Toggle Device Toolbar (Cmd+Shift+M) → set a mobile viewport. Open Console.

Test cases (do each one and check the Console):

1. **Pull from the top of an admin page (no input focused).**
   - Expected: `[ptr] tracking started`, then a stream of `[ptr] delta N` messages, then `[ptr] released`.
2. **Scroll halfway down a long page, then pull.**
   - Expected: NO log messages. The gate rejected because `scrollY !== 0`.
3. **Tap into a text input first (e.g. the new-ticket form), then try to pull.**
   - Expected: NO `tracking started`. The gate rejected because the touch target is an `INPUT`.
4. **On a page with a scrollable container that's scrolled (e.g. the chat thread on a ticket), pull from inside that container.**
   - Expected: NO `tracking started`. (You may need to construct this scenario; if no easy candidate, skip and rely on Task 7's real-device check.)

If any case fails, do not commit. Fix the gate before continuing.

- [ ] **Step 4: Commit**

```bash
git add components/PullToRefresh.tsx
git commit -m "feat(ptr): add touch tracking with activation gate"
```

---

## Task 4: Add the visual indicator (snaps back, no refresh yet)

This task adds the circular indicator that slides down as the user pulls and snaps back when they release. No refresh action is dispatched yet — releasing always returns to idle.

**Files:**
- Modify: `components/PullToRefresh.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `components/PullToRefresh.tsx` with:

```tsx
"use client";

import { type ReactNode, useEffect, useState } from "react";

const SOFT_THRESHOLD_PX = 70;
const MAX_PULL_PX = 200;
const RESISTANCE = 0.5;
const SNAP_BACK_MS = 200;
const CIRCUMFERENCE = 75; // 2π * 12

type Phase = "idle" | "pulling";

interface Props {
  children: ReactNode;
}

function isInteractiveTarget(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node) {
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

function isInsideScrolledContainer(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollTop > 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function PullToRefresh({ children }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    let tracking = false;
    let startY = 0;

    const reset = () => {
      tracking = false;
      setPhase("idle");
      setDisplayed(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (window.scrollY !== 0) return;
      if (isInteractiveTarget(e.target)) return;
      if (isInsideScrolledContainer(e.target)) return;

      tracking = true;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        reset();
        return;
      }
      e.preventDefault();
      setPhase("pulling");
      setDisplayed(Math.min(delta * RESISTANCE, MAX_PULL_PX));
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      reset();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const fillFraction = Math.min(displayed / SOFT_THRESHOLD_PX, 1);
  const dashOffset = (1 - fillFraction) * CIRCUMFERENCE;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed left-1/2 z-40 pointer-events-none"
        style={{
          top: 0,
          transform: `translate(-50%, calc(-100% + ${displayed}px))`,
          transition:
            phase === "pulling" ? "none" : `transform ${SNAP_BACK_MS}ms ease-out`,
        }}
      >
        <div className="w-10 h-10 rounded-full bg-parchment-warm shadow-[0_8px_20px_-6px_rgba(26,24,21,0.25)] ring-1 ring-rule flex items-center justify-center mt-2">
          <svg
            width="20"
            height="20"
            viewBox="0 0 28 28"
            className="text-ink-soft"
          >
            <circle
              cx="14"
              cy="14"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 14 14)"
            />
          </svg>
        </div>
      </div>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `PullToRefresh.tsx`.

- [ ] **Step 3: Manual verify — indicator slides and snaps back**

Run: `npm run dev`

In Chrome DevTools mobile emulation on an admin page at the top of the page:

1. **Pull down slowly.** A small white circular disc with a partially-drawn ring slides down from the top of the viewport. The ring fills as you pull further.
2. **At ~70px of pull**, the ring is fully drawn (a complete circle).
3. **Pull further.** The disc keeps moving down (with rubber-band resistance) up to ~200px max, but the ring stays full.
4. **Release.** The disc smoothly slides back up and out of view over ~200ms.
5. **Pull and abandon (release before any pull).** No visible artifact.

Expected: smooth, glitch-free motion. No jumps. Indicator never appears when scrolled mid-page or when starting on an input.

- [ ] **Step 4: Commit**

```bash
git add components/PullToRefresh.tsx
git commit -m "feat(ptr): render pull indicator with rubber-band resistance"
```

---

## Task 5: Add release behavior (soft and hard refresh)

Now releasing past the soft threshold dispatches `router.refresh()` and past the hard threshold does a full reload. Visual signals change to indicate which threshold has been crossed.

**Files:**
- Modify: `components/PullToRefresh.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `components/PullToRefresh.tsx` with:

```tsx
"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SOFT_THRESHOLD_PX = 70;
const HARD_THRESHOLD_PX = 150;
const MAX_PULL_PX = 200;
const RESISTANCE = 0.5;
const SNAP_BACK_MS = 200;
const SOFT_HOLD_MS = 600;
const HARD_HOLD_MS = 250;
const RESTING_PULL_PX = 48; // where the spinner sits while refreshing
const CIRCUMFERENCE = 75; // 2π * 12
const SPINNING_DASH_OFFSET = 56; // partial arc, looks like a typical spinner

type Phase = "idle" | "pulling" | "refreshing" | "reloading";

interface Props {
  children: ReactNode;
}

function isInteractiveTarget(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node) {
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

function isInsideScrolledContainer(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollTop > 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function PullToRefresh({ children }: Props) {
  const router = useRouter();
  const [displayed, setDisplayed] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  // Mirrors of state for use inside touch handlers (which capture stale closures otherwise).
  const displayedRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let tracking = false;
    let startY = 0;

    const reset = () => {
      tracking = false;
      setPhase("idle");
      setDisplayed(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current === "refreshing" || phaseRef.current === "reloading") return;
      if (e.touches.length !== 1) return;
      if (window.scrollY !== 0) return;
      if (isInteractiveTarget(e.target)) return;
      if (isInsideScrolledContainer(e.target)) return;

      tracking = true;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        reset();
        return;
      }
      e.preventDefault();
      setPhase("pulling");
      setDisplayed(Math.min(delta * RESISTANCE, MAX_PULL_PX));
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;

      const final = displayedRef.current;

      if (final >= HARD_THRESHOLD_PX) {
        setPhase("reloading");
        setDisplayed(RESTING_PULL_PX);
        timerRef.current = window.setTimeout(() => {
          window.location.reload();
        }, HARD_HOLD_MS);
      } else if (final >= SOFT_THRESHOLD_PX) {
        setPhase("refreshing");
        setDisplayed(RESTING_PULL_PX);
        router.refresh();
        timerRef.current = window.setTimeout(() => {
          setPhase("idle");
          setDisplayed(0);
        }, SOFT_HOLD_MS);
      } else {
        setPhase("idle");
        setDisplayed(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [router]);

  const fillFraction = Math.min(displayed / SOFT_THRESHOLD_PX, 1);
  const dashOffset = (1 - fillFraction) * CIRCUMFERENCE;
  const reachedSoft = displayed >= SOFT_THRESHOLD_PX;
  const reachedHard = displayed >= HARD_THRESHOLD_PX;
  const spinning = phase === "refreshing" || phase === "reloading";

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed left-1/2 z-40 pointer-events-none"
        style={{
          top: 0,
          transform: `translate(-50%, calc(-100% + ${displayed}px))`,
          transition:
            phase === "pulling" ? "none" : `transform ${SNAP_BACK_MS}ms ease-out`,
        }}
      >
        <div
          className={[
            "w-10 h-10 rounded-full bg-parchment-warm shadow-[0_8px_20px_-6px_rgba(26,24,21,0.25)] flex items-center justify-center mt-2 transition-shadow",
            reachedHard ? "ring-2 ring-signal-red" : "ring-1 ring-rule",
          ].join(" ")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 28 28"
            className={[
              reachedSoft ? "text-signal-red" : "text-ink-soft",
              spinning ? "animate-spin" : "",
            ].join(" ")}
          >
            <circle
              cx="14"
              cy="14"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={spinning ? SPINNING_DASH_OFFSET : dashOffset}
              transform="rotate(-90 14 14)"
            />
          </svg>
        </div>
      </div>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `PullToRefresh.tsx`.

- [ ] **Step 3: Manual verify — soft refresh**

Run: `npm run dev`

In Chrome DevTools mobile emulation, on an admin page (e.g. the dashboard) that displays server-rendered data:

1. Open DevTools → Network tab.
2. From the top of the page, pull down ~80–100px (past the soft threshold but well short of hard) and release.
3. **Watch the indicator:** ring fills, color shifts to red as you cross 70px, on release the disc settles at ~48px from top and starts spinning. After ~600ms it slides back up.
4. **Watch the Network tab:** an RSC request goes out (the URL will look like the page's URL with an RSC param). This is `router.refresh()` doing its job.
5. **Scroll position:** preserved (you never moved off the top, but if you scroll partway down a long list, then pull, the data should refetch but the scroll should not jump).

Expected: indicator behaves correctly, server data is re-fetched, no full page reload (no white flash, no document re-parse).

- [ ] **Step 4: Manual verify — hard refresh**

On the same page:

1. Pull down ~180px (well past the hard threshold).
2. **Watch the indicator:** ring fills, color shifts to red at 70px, then at 150px a red outer ring appears around the disc (`ring-2 ring-signal-red` replacing `ring-1 ring-rule`).
3. Release. The disc holds for ~250ms, then the page does a full reload (white flash, address bar reload spinner, full document re-parse).

Expected: clear visual difference at the hard threshold; full reload triggers cleanly.

- [ ] **Step 5: Manual verify — short pull does nothing**

Pull down ~30px (below soft threshold) and release. The indicator slides back up; no network request, no reload.

- [ ] **Step 6: Manual verify — re-pull during in-flight refresh is rejected**

Pull past the soft threshold, release, and during the spinner hold attempt to pull again. The second pull should not start a new tracking session (the `phaseRef.current` check at the top of `onTouchStart` blocks it).

- [ ] **Step 7: Commit**

```bash
git add components/PullToRefresh.tsx
git commit -m "feat(ptr): dispatch soft refresh at 70px, hard reload at 150px"
```

---

## Task 6: Edge cases — multi-touch cancel, touchcancel, reduced motion

This task hardens the component against edge cases. The behavior is identical for the common path; only edge cases change.

**Files:**
- Modify: `components/PullToRefresh.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `components/PullToRefresh.tsx` with:

```tsx
"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SOFT_THRESHOLD_PX = 70;
const HARD_THRESHOLD_PX = 150;
const MAX_PULL_PX = 200;
const RESISTANCE = 0.5;
const SNAP_BACK_MS = 200;
const SOFT_HOLD_MS = 600;
const HARD_HOLD_MS = 250;
const RESTING_PULL_PX = 48;
const CIRCUMFERENCE = 75;
const SPINNING_DASH_OFFSET = 56;

type Phase = "idle" | "pulling" | "refreshing" | "reloading";

interface Props {
  children: ReactNode;
}

function isInteractiveTarget(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node) {
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

function isInsideScrolledContainer(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollTop > 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduce;
}

export function PullToRefresh({ children }: Props) {
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  const phaseRef = useRef<Phase>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let tracking = false;
    let startY = 0;
    let currentDisplayed = 0;

    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const reset = () => {
      tracking = false;
      currentDisplayed = 0;
      clearTimer();
      setPhase("idle");
      setDisplayed(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      // Second finger landing during a pull → cancel.
      if (e.touches.length > 1) {
        if (tracking) reset();
        return;
      }
      if (phaseRef.current === "refreshing" || phaseRef.current === "reloading") return;
      if (window.scrollY !== 0) return;
      if (isInteractiveTarget(e.target)) return;
      if (isInsideScrolledContainer(e.target)) return;

      tracking = true;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        reset();
        return;
      }
      e.preventDefault();
      const next = Math.min(delta * RESISTANCE, MAX_PULL_PX);
      currentDisplayed = next;
      setPhase("pulling");
      setDisplayed(next);
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;

      const final = currentDisplayed;

      if (final >= HARD_THRESHOLD_PX) {
        setPhase("reloading");
        currentDisplayed = RESTING_PULL_PX;
        setDisplayed(RESTING_PULL_PX);
        timerRef.current = window.setTimeout(() => {
          window.location.reload();
        }, HARD_HOLD_MS);
      } else if (final >= SOFT_THRESHOLD_PX) {
        setPhase("refreshing");
        currentDisplayed = RESTING_PULL_PX;
        setDisplayed(RESTING_PULL_PX);
        router.refresh();
        timerRef.current = window.setTimeout(() => {
          setPhase("idle");
          setDisplayed(0);
        }, SOFT_HOLD_MS);
      } else {
        setPhase("idle");
        setDisplayed(0);
      }
    };

    const onTouchCancel = () => {
      if (!tracking) return;
      reset();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchCancel);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [router]);

  const fillFraction = Math.min(displayed / SOFT_THRESHOLD_PX, 1);
  const dashOffset = (1 - fillFraction) * CIRCUMFERENCE;
  const reachedSoft = displayed >= SOFT_THRESHOLD_PX;
  const reachedHard = displayed >= HARD_THRESHOLD_PX;
  const spinning = phase === "refreshing" || phase === "reloading";
  const spinClass = spinning ? (reduceMotion ? "animate-pulse" : "animate-spin") : "";
  const transition =
    phase === "pulling" || reduceMotion
      ? "none"
      : `transform ${SNAP_BACK_MS}ms ease-out`;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed left-1/2 z-40 pointer-events-none"
        style={{
          top: 0,
          transform: `translate(-50%, calc(-100% + ${displayed}px))`,
          transition,
        }}
      >
        <div
          className={[
            "w-10 h-10 rounded-full bg-parchment-warm shadow-[0_8px_20px_-6px_rgba(26,24,21,0.25)] flex items-center justify-center mt-2 transition-shadow",
            reachedHard ? "ring-2 ring-signal-red" : "ring-1 ring-rule",
          ].join(" ")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 28 28"
            className={[
              reachedSoft ? "text-signal-red" : "text-ink-soft",
              spinClass,
            ].join(" ")}
          >
            <circle
              cx="14"
              cy="14"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={spinning ? SPINNING_DASH_OFFSET : dashOffset}
              transform="rotate(-90 14 14)"
            />
          </svg>
        </div>
      </div>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `PullToRefresh.tsx`.

- [ ] **Step 3: Manual verify — multi-touch cancel**

In DevTools mobile emulation, simulating multi-touch is awkward. The cleaner way is to verify on a real device in Task 7. For now, do a code-read sanity check: confirm that `onTouchStart` with `e.touches.length > 1` calls `reset()` if `tracking` was true, and that `onTouchMove` with `e.touches.length !== 1` calls `reset()`.

- [ ] **Step 4: Manual verify — reduced motion**

In Chrome DevTools: open Command Menu (Cmd+Shift+P) → "Show Rendering" → set "Emulate CSS media feature prefers-reduced-motion" to `reduce`.

Reload the page. In mobile emulation, pull past the soft threshold and release.

Expected:
- Snap-back has no easing — the disc jumps back to the hidden position rather than gliding.
- During the refresh hold, the indicator pulses (opacity) instead of spinning rotationally.

Reset the emulation after testing.

- [ ] **Step 5: Manual verify — common path still works**

Disable the reduced-motion emulation. Repeat the soft-refresh check from Task 5 Step 3 to confirm nothing regressed.

- [ ] **Step 6: Commit**

```bash
git add components/PullToRefresh.tsx
git commit -m "feat(ptr): handle multi-touch cancel and reduced-motion"
```

---

## Task 7: Real-device verification

This is the only task where DevTools emulation is not enough. The full checklist from the spec runs against real iOS Safari (the primary PWA target) and real Android Chrome.

**Files:** none modified during verification — only if a bug is found.

- [ ] **Step 1: Deploy to a preview environment, or expose `npm run dev` over LAN**

Pick whichever is easier:
- Vercel preview deploy from the current branch, OR
- `npm run dev -- --hostname 0.0.0.0` and visit `http://<your-mac-ip>:3000` from your phone on the same Wi-Fi.

- [ ] **Step 2: Test on iOS Safari (in-browser tab)**

On an iPhone, sign in to the portal at the top of the dashboard:

- [ ] Pull-to-refresh works at all (gesture is recognized).
- [ ] Soft-threshold pull triggers `router.refresh()` (no white flash; data updates if anything changed).
- [ ] Hard-threshold pull triggers a full reload (white flash; address bar shows reload spinner).
- [ ] Pulling on a focused input does NOT trigger.
- [ ] Pulling when scrolled mid-page does NOT trigger.
- [ ] Pulling inside a scrolled chat thread does NOT trigger.
- [ ] Two-finger pinch during a pull cancels the gesture.

- [ ] **Step 3: Test on iOS Safari, installed as PWA (standalone)**

"Add to Home Screen" → open the home-screen app → repeat all checks from Step 2. This is the **primary target** — confirm everything that worked in-browser also works in standalone.

- [ ] **Step 4: Test on Android Chrome (standalone PWA)**

Install the PWA on Android → repeat all checks from Step 2.

- [ ] **Step 5: Test the auth/landing page exclusion**

On a phone, go to `/auth/login` (signed out). Try to pull-to-refresh. **Expected:** native browser pull-to-refresh works (in browser tab) or nothing happens (in standalone PWA) — but our custom indicator does NOT appear, because no shell is mounted on this route.

- [ ] **Step 6: If any check failed**

Reproduce in DevTools mobile emulation if possible, fix in `components/PullToRefresh.tsx`, re-run the affected check, and commit with a `fix(ptr): ...` message describing the specific bug. Do not commit if any item in this task's checklist is still failing.

- [ ] **Step 7: Final summary commit (only if changes were made)**

If Step 6 produced fixes, the commits from Step 6 are the final state. If nothing needed fixing, no commit is needed for this task — Tasks 1–6 already form the complete feature.

---

## Self-review

**Spec coverage:**
- Goal (dual-threshold pull-to-refresh on PWA) → Tasks 1–5.
- Non-goal: desktop support → never added (touch-only listeners).
- Non-goal: auth/invite/marketing pages → satisfied by mounting only in shells (Task 2).
- Non-goal: library dependency → none added.
- Non-goal: per-page refresh callbacks → component is self-contained, no exposed callback prop.
- Decision: scope inside shells only → Task 2.
- Decision: 70px / 150px thresholds → Task 5 constants `SOFT_THRESHOLD_PX`, `HARD_THRESHOLD_PX`.
- Decision: touch-only → Task 3 onward.
- Decision: activation gate (scrollY, single finger, non-interactive target, non-scrolled ancestor) → Task 3.
- Decision: 0.5 resistance, 200px max → Task 4 constants `RESISTANCE`, `MAX_PULL_PX`.
- Decision: indicator (28px circle inside 40px disc, fills 0–70px, color shift past 70px, outer ring past 150px, spins during refresh) → Tasks 4–5.
- Decision: reduced motion (no easing on snap-back, opacity pulse instead of spin) → Task 6.
- Decision: z-index between content and modals → `z-40` (matches existing `ScrollToTop.tsx` precedent).
- Decision: cancellation on second finger / touchcancel → Task 6.
- Edge cases (scrolled mid-page, inputs, inner scrollers, multi-touch, upward drag, in-flight refresh) → Tasks 3–6.
- Manual testing checklist → Task 7.

All spec items are covered.

**Type consistency:** `Phase` type, `displayed`/`phase` state, `displayedRef`/`phaseRef`/`timerRef`, `SOFT_THRESHOLD_PX`/`HARD_THRESHOLD_PX`/`MAX_PULL_PX`/`RESISTANCE`/`SNAP_BACK_MS`/`SOFT_HOLD_MS`/`HARD_HOLD_MS`/`RESTING_PULL_PX`/`CIRCUMFERENCE`/`SPINNING_DASH_OFFSET` — all consistent across Tasks 4, 5, 6. Helper signatures `isInteractiveTarget(el: EventTarget | null): boolean` and `isInsideScrolledContainer(el: EventTarget | null): boolean` — identical in every task that uses them.

**Placeholders:** none. Every step has either complete code or an exact verification action.

**Scope:** single feature, three files, one focused implementation plan. No decomposition needed.
