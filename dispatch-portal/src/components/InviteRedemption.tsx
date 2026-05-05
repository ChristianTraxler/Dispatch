"use client";

import { useState, type CSSProperties } from "react";
import { Masthead } from "./Masthead";

export type InviteState =
  | "INVALID"
  | "NEW_SIGNUP"
  | "EXISTING_NEEDS_LOGIN"
  | "EXISTING_LOGGED_IN_MATCH"
  | "EXISTING_LOGGED_IN_MISMATCH";

export interface InviteData {
  email: string;
  siteUrl: string;
  siteDisplayName: string;
}

export interface InviteRedemptionProps {
  state: InviteState;
  invite?: InviteData;
  /** For MISMATCH state — the email of the currently logged-in account */
  currentSessionEmail?: string;
  onSignup?: (data: { name: string; password: string }) => void | Promise<void>;
  onLogin?: (data: { password: string }) => void | Promise<void>;
  onConfirmMerge?: () => void | Promise<void>;
  onSignOut?: () => void | Promise<void>;
  className?: string;
  style?: CSSProperties;
}

export function InviteRedemption({
  state,
  invite,
  currentSessionEmail,
  onSignup,
  onLogin,
  onConfirmMerge,
  onSignOut,
  className = "",
  style,
}: InviteRedemptionProps) {
  return (
    <div className={`min-h-screen flex flex-col ${className}`} style={style}>
      <Masthead />
      <main className="flex-1 flex items-start md:items-center justify-center px-5 py-10 md:py-16">
        <div className="w-full max-w-lg">
          {state === "INVALID" && <InvalidState />}
          {state === "NEW_SIGNUP" && invite && <NewSignupState invite={invite} onSubmit={onSignup} />}
          {state === "EXISTING_NEEDS_LOGIN" && invite && (
            <ExistingNeedsLoginState invite={invite} onSubmit={onLogin} />
          )}
          {state === "EXISTING_LOGGED_IN_MATCH" && invite && (
            <ExistingMatchState invite={invite} onConfirm={onConfirmMerge} />
          )}
          {state === "EXISTING_LOGGED_IN_MISMATCH" && invite && (
            <MismatchState
              invite={invite}
              currentSessionEmail={currentSessionEmail ?? ""}
              onSignOut={onSignOut}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ============================================
   STATE COMPONENTS
   ============================================ */
function StateLabel({ section, label }: { section: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
        {section}
      </span>
      <span className="h-px flex-1 bg-rule" />
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
        {label}
      </span>
    </div>
  );
}

/* --- INVALID --- */
function InvalidState() {
  return (
    <>
      <StateLabel section="§ ERR" label="Invitation Closed" />
      <h2
        className="font-display text-3xl md:text-4xl leading-tight mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        This invite is no longer
        <br />
        <span className="italic text-signal-red">valid.</span>
      </h2>
      <p className="font-display text-ink-mute italic mb-10 text-base">
        It may have expired (invites last 7 days) or already been used. If you
        still need access, reach out and I'll send a fresh one.
      </p>
      <div className="rule-thin pt-6">
        <a
          href="mailto:hello@developerofcode.com"
          className="btn-ghost"
        >
          Email me for a new invite →
        </a>
      </div>
    </>
  );
}

/* --- NEW SIGNUP --- */
function NewSignupState({
  invite,
  onSubmit,
}: {
  invite: InviteData;
  onSubmit?: (data: { name: string; password: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StateLabel section="§ 01" label="Welcome" />
      <h2
        className="font-display text-3xl md:text-4xl leading-tight mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Set up your
        <br />
        <span className="italic text-signal-red">support desk.</span>
      </h2>
      <p className="font-display text-ink-mute italic mb-8 text-base">
        Christian invited you to file dispatches for the site below. Pick a
        password and you're in.
      </p>

      {/* Invite particulars — locked */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-10 rule-thin pb-6">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Site
        </span>
        <span className="font-display text-base text-ink">
          {invite.siteDisplayName}{" "}
          <span className="font-mono text-xs text-ink-mute">— {invite.siteUrl}</span>
        </span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Email
        </span>
        <span className="font-mono text-sm text-ink">{invite.email}</span>
      </div>

      <form onSubmit={handle} className="space-y-7">
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Your name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last"
            required
            className="input-line"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Pick a password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            className="input-line"
            autoComplete="new-password"
          />
        </div>

        <div className="flex items-center justify-end pt-4">
          <button type="submit" disabled={submitting} className="btn-dispatch">
            {submitting ? "Setting up…" : "Set up account →"}
          </button>
        </div>
      </form>
    </>
  );
}

/* --- EXISTING NEEDS LOGIN --- */
function ExistingNeedsLoginState({
  invite,
  onSubmit,
}: {
  invite: InviteData;
  onSubmit?: (data: { password: string }) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StateLabel section="§ 02" label="Welcome Back" />
      <h2
        className="font-display text-3xl md:text-4xl leading-tight mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Log in to add
        <br />
        <span className="italic text-signal-red">{invite.siteDisplayName}</span>
        <br />
        to your account.
      </h2>
      <p className="font-display text-ink-mute italic mb-10 text-base">
        You already have a Dispatch account at <strong>{invite.email}</strong>.
        Sign in and the site will attach to your existing account.
      </p>

      <form onSubmit={handle} className="space-y-7">
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Email
          </label>
          <input
            value={invite.email}
            disabled
            className="input-line opacity-60"
          />
        </div>
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
            className="input-line"
            autoComplete="current-password"
          />
        </div>
        <div className="flex items-center justify-between gap-4 pt-2">
          <a
            href="/portal/forgot-password"
            className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
          >
            Forgot password?
          </a>
          <button type="submit" disabled={submitting} className="btn-dispatch">
            {submitting ? "Signing in…" : "Sign in & merge →"}
          </button>
        </div>
      </form>
    </>
  );
}

/* --- EXISTING LOGGED-IN MATCH --- */
function ExistingMatchState({
  invite,
  onConfirm,
}: {
  invite: InviteData;
  onConfirm?: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    if (!onConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StateLabel section="§ 03" label="Confirm Merge" />
      <h2
        className="font-display text-3xl md:text-4xl leading-tight mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Add{" "}
        <span className="italic text-signal-red">{invite.siteDisplayName}</span>{" "}
        to your account?
      </h2>
      <p className="font-display text-ink-mute italic mb-8 text-base">
        You'll be able to file tickets for this site alongside your existing sites.
      </p>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-10 rule-thin pb-6">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Site to add
        </span>
        <span className="font-display text-base text-ink">
          {invite.siteDisplayName}{" "}
          <span className="font-mono text-xs text-ink-mute">— {invite.siteUrl}</span>
        </span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Account
        </span>
        <span className="font-mono text-sm text-ink">{invite.email}</span>
      </div>

      <div className="flex items-center justify-end gap-3">
        <a
          href="/portal/dashboard"
          className="btn-ghost"
        >
          Cancel
        </a>
        <button type="button" onClick={handle} disabled={submitting} className="btn-dispatch">
          {submitting ? "Adding…" : "Add site →"}
        </button>
      </div>
    </>
  );
}

/* --- MISMATCH --- */
function MismatchState({
  invite,
  currentSessionEmail,
  onSignOut,
}: {
  invite: InviteData;
  currentSessionEmail: string;
  onSignOut?: () => void | Promise<void>;
}) {
  return (
    <>
      <StateLabel section="§ ERR" label="Account Mismatch" />
      <h2
        className="font-display text-3xl md:text-4xl leading-tight mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        This invite isn't for
        <br />
        <span className="italic text-signal-red">your current account.</span>
      </h2>
      <p className="font-display text-ink-mute italic mb-10 text-base">
        You're signed in as <strong>{currentSessionEmail}</strong>, but this invite
        was sent to <strong>{invite.email}</strong>. Sign out and click the invite
        link again, or contact me if this is a mistake.
      </p>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-10 rule-thin pb-6">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Invite is for
        </span>
        <span className="font-mono text-sm text-ink">{invite.email}</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          You're signed in as
        </span>
        <span className="font-mono text-sm text-ink">{currentSessionEmail}</span>
      </div>

      <div className="flex items-center justify-end gap-3">
        <a href="/portal/dashboard" className="btn-ghost">
          Stay signed in
        </a>
        <button type="button" onClick={onSignOut} className="btn-dispatch">
          Sign out & retry →
        </button>
      </div>
    </>
  );
}
