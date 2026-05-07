"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface EmergencyFixModalProps {
  open: boolean;
  feeCents: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EmergencyFixModal({ open, feeCents, onConfirm, onCancel }: EmergencyFixModalProps) {
  const titleId = useId();
  const [acked, setAcked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Reset acknowledgment whenever the modal opens.
  useEffect(() => {
    if (open) setAcked(false);
  }, [open]);

  // Focus management + Esc-to-cancel + Enter-to-confirm-when-acked.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelBtnRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        if (acked) {
          e.preventDefault();
          onConfirm();
        }
      } else if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, acked, onCancel, onConfirm]);

  if (!open) return null;

  const dollars = (feeCents / 100).toFixed(0);

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/60"
      />
      <div
        ref={dialogRef}
        className="relative bg-parchment border border-ink max-w-lg w-full p-8 shadow-xl"
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">⚠</span>
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
            Outside business hours
          </span>
        </div>

        <h2
          id={titleId}
          className="font-display text-3xl leading-tight mb-3"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          Emergency fix
        </h2>

        <p className="text-ink-soft leading-relaxed mb-5">
          It&rsquo;s currently outside business hours. Filing as Emergency means it gets worked on
          right away, with a <strong>${dollars}</strong> fee added to your next invoice.
          Otherwise, file a normal ticket and it will be picked up next business day.
        </p>

        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-1"
          />
          <span className="font-display text-ink">
            I acknowledge the <strong>${dollars}</strong> emergency fee.
          </span>
        </label>

        <div className="flex justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="btn-ghost"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={!acked}
            className="btn-dispatch"
          >
            Confirm — file as emergency
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
