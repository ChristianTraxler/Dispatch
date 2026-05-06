"use client";

import { useState, type CSSProperties } from "react";

export interface AdminInviteNewSubmission {
  recipientName: string;
  email: string;
  siteUrl: string;
  siteDisplayName: string;
  note?: string;
}

export interface AdminInviteNewPageProps {
  onSubmit?: (data: AdminInviteNewSubmission) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
  style?: CSSProperties;
}

function suggestDisplayName(rawUrl: string): string {
  if (!rawUrl) return "";
  // Strip protocol, www, path, trailing slashes — get the bare hostname
  let host = rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
  // Drop the TLD
  const parts = host.split(".");
  if (parts.length >= 2) host = parts[parts.length - 2];
  // Title-case
  return host
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function AdminInviteNewPage({
  onSubmit,
  onCancel,
  className = "",
  style,
}: AdminInviteNewPageProps) {
  const [recipientName, setRecipientName] = useState("");
  const [email, setEmail] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteDisplayName, setSiteDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-suggest display name from URL until the user types over it
  function handleUrlChange(value: string) {
    setSiteUrl(value);
    if (!displayNameTouched) {
      setSiteDisplayName(suggestDisplayName(value));
    }
  }

  const canSubmit = !!email.trim() && !!siteUrl.trim() && !!siteDisplayName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit?.({
        recipientName: recipientName.trim(),
        email: email.trim().toLowerCase(),
        siteUrl: normalizeUrl(siteUrl),
        siteDisplayName: siteDisplayName.trim(),
        note: note.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`max-w-2xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Section label */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          New Invitation
        </span>
      </div>

      <h1
        className="font-display text-3xl md:text-5xl leading-tight mb-2"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Send a new
        <br />
        <span className="italic text-signal-red">dispatch invite.</span>
      </h1>
      <p className="font-display italic text-ink-mute mb-10 text-base">
        The recipient receives a link valid for 7 days. They set up their account
        and the site is bound to it on signup.
      </p>

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Recipient */}
        <div>
          <label
            htmlFor="recipientName"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Recipient name
          </label>
          <input
            id="recipientName"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Sarah Mathers"
            className="input-line"
            autoComplete="off"
          />
          <p className="font-display italic text-xs text-ink-mute mt-1">
            Used in the invite email greeting. Optional.
          </p>
        </div>

        <div>
          <label
            htmlFor="email"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Recipient email *
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sarah@yoursite.com"
            required
            className="input-line"
            autoComplete="off"
          />
        </div>

        <div className="rule-thin pt-7">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-3 block">
            Site to grant access to
          </span>
        </div>

        <div>
          <label
            htmlFor="siteUrl"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            URL *
          </label>
          <input
            id="siteUrl"
            value={siteUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="renegadewellness.com"
            required
            className="input-line"
            autoComplete="off"
          />
          <p className="font-display italic text-xs text-ink-mute mt-1">
            No need for https:// — the protocol gets stripped.
          </p>
        </div>

        <div>
          <label
            htmlFor="siteDisplayName"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Display name *
          </label>
          <input
            id="siteDisplayName"
            value={siteDisplayName}
            onChange={(e) => {
              setSiteDisplayName(e.target.value);
              setDisplayNameTouched(true);
            }}
            placeholder="Renegade Wellness Center"
            required
            className="input-line"
            autoComplete="off"
          />
          <p className="font-display italic text-xs text-ink-mute mt-1">
            What the client sees in their site dropdown when filing tickets.
          </p>
        </div>

        <div className="rule-thin pt-7">
          <label
            htmlFor="note"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Note (optional)
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you want included in the invite email — context, kickoff details, etc."
            rows={3}
            className="input-line resize-y min-h-[80px]"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 pt-4 rule-thin border-t">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="btn-ghost">
              ← Cancel
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={!canSubmit || submitting} className="btn-dispatch">
            {submitting ? "Sending…" : "Send invite →"}
          </button>
        </div>
      </form>
    </div>
  );
}
