"use client";

import { useEffect, useRef, useState } from "react";

// Anchor links to the Account sections, shown on wide screens. The labels
// are the sections' own titles.
const SECTIONS = [
  { id: "profile-picture", label: "Profile picture" },
  { id: "live-preview", label: "Live preview" },
  { id: "business-hours", label: "Business Hours" },
  { id: "out-of-office", label: "Out of Office" },
  { id: "scheduled-vacations", label: "Scheduled Vacations" },
  { id: "out-of-town", label: "Out of Town" },
  { id: "holidays", label: "Holidays" },
  { id: "emergency-fee", label: "Emergency Fee" },
  { id: "notifications", label: "Notifications" },
  { id: "passkeys", label: "Passkeys" },
];

export function SectionIndex() {
  const [current, setCurrent] = useState(SECTIONS[0].id);
  // After a click, hold the clicked section lit until the jump finishes;
  // otherwise the scroll listener overrides it with whichever section the
  // page happens to be passing (or the last one that fits on screen).
  const lockRef = useRef<{ id: string; timer: number } | null>(null);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;
    // The section whose top has most recently passed the upper third wins.
    const pick = () => {
      if (lockRef.current) return;
      const line = window.innerHeight * 0.33;
      let active = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) active = el.id;
      }
      setCurrent(active);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      if (lockRef.current) window.clearTimeout(lockRef.current.timer);
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, []);

  function onJump(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    if (lockRef.current) window.clearTimeout(lockRef.current.timer);
    setCurrent(id);
    const unlock = () => {
      lockRef.current = null;
    };
    lockRef.current = { id, timer: window.setTimeout(unlock, 1200) };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav className="dk-toc" aria-label="Account sections">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => onJump(e, s.id)}
          className={current === s.id ? "dk-on" : undefined}
          aria-current={current === s.id ? "true" : undefined}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
