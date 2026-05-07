"use client";

import { useCallback, useEffect, useState } from "react";

const SHOW_THRESHOLD_PX = 300;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_THRESHOLD_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onClick = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to top"
      title="Scroll to top"
      // Sits above the floating chat launcher (which lives at bottom-6 right-6
      // and is 60px tall); bottom-24 leaves a clean ~12px gap. On pages without
      // the launcher (login, invite), it just floats higher — still unobtrusive.
      className={`fixed bottom-24 right-6 z-40 w-11 h-11 rounded-full bg-parchment-warm text-ink-soft flex items-center justify-center origin-bottom-right shadow-[0_8px_20px_-6px_rgba(26,24,21,0.25),_0_2px_5px_-1px_rgba(26,24,21,0.1)] ring-1 ring-rule transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-red focus-visible:ring-offset-2 focus-visible:ring-offset-parchment ${
        visible
          ? "opacity-100 scale-100 hover:-translate-y-0.5 hover:text-signal-red hover:ring-signal-red/40 hover:shadow-[0_12px_24px_-8px_rgba(26,24,21,0.3),_0_3px_8px_-2px_rgba(26,24,21,0.14)] active:translate-y-0 active:scale-95"
          : "opacity-0 scale-75 pointer-events-none"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
