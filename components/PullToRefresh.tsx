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
        aria-hidden
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
