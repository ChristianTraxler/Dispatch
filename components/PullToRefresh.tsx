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
