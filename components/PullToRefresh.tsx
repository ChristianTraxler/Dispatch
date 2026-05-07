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
