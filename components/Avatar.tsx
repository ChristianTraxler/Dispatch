"use client";

import Image from "next/image";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

interface AvatarProps {
  /** Signed URL or static path; if absent, initials are shown */
  src?: string | null;
  /** Used for initials fallback and alt text */
  name: string;
  /** px size; defaults to 32 */
  size?: number;
  /** Visual variant: parchment circle (client) vs ink circle (admin) */
  tone?: "client" | "admin";
  className?: string;
}

export function Avatar({ src, name, size = 32, tone = "client", className = "" }: AvatarProps) {
  const initials = initialsOf(name);
  const dim = `${size}px`;
  const fontSize = Math.max(10, Math.round(size * 0.4));

  const baseRing =
    tone === "admin"
      ? "ring-1 ring-inset ring-signal-red/40 bg-ink text-parchment-warm"
      : "ring-1 ring-inset ring-rule bg-parchment-deep text-ink-soft";

  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full font-mono uppercase tracking-wider shrink-0 ${baseRing} ${className}`}
        style={{ width: dim, height: dim, fontSize: `${fontSize}px` }}
        aria-label={name}
        title={name}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden ring-1 ring-inset ring-rule shrink-0 ${className}`}
      style={{ width: dim, height: dim }}
      aria-label={name}
      title={name}
    >
      <Image
        src={src}
        alt={name}
        width={size * 2}
        height={size * 2}
        unoptimized
        className="w-full h-full object-cover"
      />
    </span>
  );
}
