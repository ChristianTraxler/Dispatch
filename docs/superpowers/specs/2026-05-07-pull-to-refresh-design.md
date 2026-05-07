# Pull-to-Refresh

**Status:** Design approved 2026-05-07
**Owner:** Christian Traxler
**Affects:** `components/AdminShell.tsx`, `components/PortalShell.tsx`, one new component

## Goal

Let mobile users refresh the current page by pulling down from the top — the standard PWA gesture. Standalone-installed PWAs disable the browser's native pull-to-refresh, so we have to provide our own. The gesture has two thresholds: a short pull does a Next.js soft refresh (re-fetches server components without losing client state), and a long pull does a full reload.

## Non-goals

- Desktop support. Touch devices only — desktop users keep the browser refresh button.
- Refreshing on auth, invite, and marketing pages. Pull-to-refresh is only inside the authenticated shells.
- A library dependency. Implementation is hand-rolled.
- Per-page refresh callbacks. The component owns the refresh action; pages don't opt in or override.

## Decisions

| Topic | Decision |
|---|---|
| Scope | Mounted inside `AdminShell` and `PortalShell` only. Auth, invite, and root pages get nothing. |
| Refresh kind | Dual threshold: `>=70px` triggers `router.refresh()`; `>=150px` triggers `window.location.reload()`. |
| Devices | Touch-only. Listeners are `touchstart` / `touchmove` / `touchend` / `touchcancel`. No mouse fallback. |
| Activation gate | Tracking starts only when `window.scrollY === 0`, single finger, and the touch target is not inside an `input`, `textarea`, `[contenteditable]`, or an element with `overflow: auto/scroll` that is itself scrolled. |
| Resistance | Displayed pull = `delta * 0.5`, clamped to 200px, so it feels rubbery. |
| Indicator | A 28px circular SVG centered at the top, sliding down from above as the user pulls. Stroke fills proportionally `0 → 70px`. Color shifts to accent past 70px. A faint outer ring fades in past 150px. Spins during refresh. |
| Reduced motion | If `prefers-reduced-motion: reduce`: snap-back has no easing; the spinner pulses opacity instead of rotating. |
| Z-index | Above page content but below modals. Implementation reads the shells to confirm an exact value that sits between content and modal overlays. |
| Cancellation | A second finger landing or a `touchcancel` event snaps the indicator back to 0 immediately. |

## Architecture

A single client component:

```
components/PullToRefresh.tsx   ('use client')
  └── default export: <PullToRefresh>{children}</PullToRefresh>
```

Internally:

- Refs hold touch state (`startY`, `tracking`, `lastDelta`) — these don't need to trigger re-renders.
- `useState` holds only what the UI needs to react to: `displayed` (number, the rendered pull distance) and `phase` (`'idle' | 'pulling' | 'refreshing' | 'reloading'`).
- `useRouter()` from `next/navigation` for the soft refresh.
- Touch listeners attached to `document` (passive: false on `touchmove` so we can `preventDefault()` to suppress browser bounce when actively pulling).

### State machine

```
idle ──touchstart at top──▶ pulling
pulling ──touchend, displayed >= 150──▶ reloading ──~250ms──▶ window.location.reload()
pulling ──touchend, 70 <= displayed < 150──▶ refreshing ──router.refresh(), ~600ms──▶ idle
pulling ──touchend, displayed < 70──▶ idle (animate back)
pulling ──touchcancel / second finger──▶ idle (snap back)
```

### Indicator markup (sketch)

```tsx
<div
  aria-hidden
  style={{
    position: 'fixed',
    top: 0,
    left: '50%',
    transform: `translate(-50%, calc(-100% + ${displayed}px))`,
    transition: phase === 'pulling' ? 'none' : 'transform 200ms ease-out',
  }}
  className="z-40 ..."
>
  <svg width="28" height="28" viewBox="0 0 28 28">
    <circle ... strokeDasharray={...} />
  </svg>
</div>
```

## Integration

| File | Change |
|---|---|
| `components/PullToRefresh.tsx` | New file. |
| `components/AdminShell.tsx` | Wrap the children render in `<PullToRefresh>...</PullToRefresh>`. Insertion point identified by reading the file. |
| `components/PortalShell.tsx` | Same change. |
| `app/layout.tsx` | Untouched — keeps auth/invite/root pages free of the gesture. |

## Edge cases & guards

- **Scrolled mid-page.** Activation gate checks `window.scrollY === 0` on `touchstart`. If the page is scrolled, no tracking begins.
- **Inputs and editable areas.** Target is walked up the DOM; if an ancestor is `input`, `textarea`, `select`, or `[contenteditable]`, no tracking begins. Prevents iOS keyboard fights.
- **Inner scrollers.** Walk up from the touch target; if any ancestor has `overflow-y: auto/scroll` AND its `scrollTop > 0`, no tracking begins. This protects the chat thread, ticket lists with internal scroll, modals, etc.
- **Multi-touch.** A second finger landing during `pulling` cancels and snaps back to 0. Prevents pinch/zoom from being interpreted as a pull.
- **Upward drag.** If `delta <= 0` during `touchmove`, abandon tracking — user is scrolling up, not pulling.
- **In-flight refresh.** While `phase === 'refreshing' | 'reloading'`, ignore new `touchstart` events.
- **Route change during refresh.** `router.refresh()` is non-blocking, so we just hold the spinner for ~600ms and snap back. If the user navigates mid-refresh, the component unmounts cleanly — no async leak because we only set state via timers we clear in cleanup.

## Testing

Manual on real devices — no useful unit-test surface for a touch gesture.

- [ ] iOS Safari, standalone PWA (primary target): soft refresh works, hard refresh works.
- [ ] iOS Safari, browser tab: gesture works, doesn't fight Safari's own pull-to-refresh.
- [ ] Android Chrome, standalone PWA.
- [ ] Pulling on a chat thread (internal scroller) does NOT trigger.
- [ ] Pulling on a focused input does NOT trigger.
- [ ] Pulling when scrolled mid-page does NOT trigger.
- [ ] Soft refresh: scroll position is preserved, server data updates.
- [ ] Hard refresh past 150px reloads the page.
- [ ] Reduced-motion setting kills the spin and easing.
- [ ] Auth, invite, and root pages have no pull-to-refresh.
- [ ] Second finger during a pull cancels cleanly.
