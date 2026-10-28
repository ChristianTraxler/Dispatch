"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;
    // The section whose top has most recently passed the upper third wins.
    const pick = () => {
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
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, []);

  return (
    <nav className="dk-toc" aria-label="Account sections">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={current === s.id ? "dk-on" : undefined}
          aria-current={current === s.id ? "true" : undefined}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
