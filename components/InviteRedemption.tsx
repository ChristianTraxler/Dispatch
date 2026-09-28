"use client";

import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { AuthLayout, PHOTO_OUTLINE_BUTTON } from "./AuthLayout";

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
  /** For MISMATCH state, the email of the currently logged-in account */
  currentSessionEmail?: string;
  onSignup?: (data: { name: string; password: string }) => void | Promise<void>;
  onLogin?: (data: { password: string }) => void | Promise<void>;
  onConfirmMerge?: () => void | Promise<void>;
  onSignOut?: () => void | Promise<void>;
  className?: string;
  style?: CSSProperties;
}

/** Outer styling handed through to the page frame. */
type Frame = { className?: string; style?: CSSProperties };

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
  const frame: Frame = { className, style };

  if (state === "INVALID") return <InvalidState frame={frame} />;
  // Every other state describes a real invite; without one there is nothing to show.
  if (!invite) return null;

  switch (state) {
    case "NEW_SIGNUP":
      return <NewSignupState frame={frame} invite={invite} onSubmit={onSignup} />;
    case "EXISTING_NEEDS_LOGIN":
      return <ExistingNeedsLoginState frame={frame} invite={invite} onSubmit={onLogin} />;
    case "EXISTING_LOGGED_IN_MATCH":
      return <ExistingMatchState frame={frame} invite={invite} onConfirm={onConfirmMerge} />;
    case "EXISTING_LOGGED_IN_MISMATCH":
      return (
        <MismatchState
          frame={frame}
          invite={invite}
          currentSessionEmail={currentSessionEmail ?? ""}
          onSignOut={onSignOut}
        />
      );
  }
}

/* ============================================
   SHARED PIECES
   ============================================ */

/** The invite's particulars, locked: label on the left, value on the right. */
function Particulars({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-10 rule-thin pb-6">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt className="font-mono text-[0.8125rem] text-ink-mute">{row.label}</dt>
          <dd className="min-w-0">{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SiteValue({ invite }: { invite: InviteData }) {
  return (
    <span className="font-display text-base text-ink">
      {invite.siteDisplayName}
      <span className="block break-all font-mono text-xs text-ink-mute">{invite.siteUrl}</span>
    </span>
  );
}

function EmailValue({ email }: { email: string }) {
  return <span className="break-all font-mono text-sm text-ink">{email}</span>;
}

/* ============================================
   STATE COMPONENTS
   ============================================ */

/* --- INVALID --- */
function InvalidState({ frame }: { frame: Frame }) {
  return (
    <AuthLayout
      {...frame}
      variant="message"
      title={
        <>
          This invite is no longer
          <br className="hidden lg:inline" />
          valid.
        </>
      }
      intro={
        <>
          It may have expired (invites last 7 days) or already been used. If you
          still need access, reach out and I&rsquo;ll send a fresh one.
        </>
      }
    >
      <a href="mailto:hello@developerofcode.com" className={PHOTO_OUTLINE_BUTTON}>
        Email me for a new invite →
      </a>
    </AuthLayout>
  );
}

/* --- NEW SIGNUP --- */
function NewSignupState({
  frame,
  invite,
  onSubmit,
}: {
  frame: Frame;
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
    <AuthLayout
      {...frame}
      title={
        <>
          Set up your
          <br />
          support desk.
        </>
      }
      intro={
        <>
          Christian invited you to file dispatches for the site below. Pick a
          password and you&rsquo;re in.
        </>
      }
    >
      <Particulars
        rows={[
          { label: "Site", value: <SiteValue invite={invite} /> },
          { label: "Email", value: <EmailValue email={invite.email} /> },
        ]}
      />

      <form onSubmit={handle} className="space-y-7">
        <div>
          <label htmlFor="invite-name" className="block font-mono text-[0.8125rem] text-ink-mute mb-1">
            Your name
          </label>
          <input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last"
            required
            className="input-line"
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="invite-password" className="block font-mono text-[0.8125rem] text-ink-mute mb-1">
            Pick a password
          </label>
          <input
            id="invite-password"
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
    </AuthLayout>
  );
}

/* --- EXISTING NEEDS LOGIN --- */
function ExistingNeedsLoginState({
  frame,
  invite,
  onSubmit,
}: {
  frame: Frame;
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
    <AuthLayout
      {...frame}
      title={
        <>
          Log in to add
          <br />
          {invite.siteDisplayName}
          <br />
          to your account.
        </>
      }
      intro={
        <>
          You already have a Dispatch account at <strong>{invite.email}</strong>.
          Sign in and the site will attach to your existing account.
        </>
      }
    >
      <form onSubmit={handle} className="space-y-7">
        <div>
          <label htmlFor="invite-login-email" className="block font-mono text-[0.8125rem] text-ink-mute mb-1">
            Email
          </label>
          <input
            id="invite-login-email"
            value={invite.email}
            disabled
            className="input-line opacity-60"
          />
        </div>
        <div>
          <label htmlFor="invite-login-password" className="block font-mono text-[0.8125rem] text-ink-mute mb-1">
            Password
          </label>
          <input
            id="invite-login-password"
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
            className="font-mono text-[0.8125rem] text-ink-mute hover:text-accent transition-colors"
          >
            Forgot password?
          </a>
          <button type="submit" disabled={submitting} className="btn-dispatch">
            {submitting ? "Signing in…" : "Sign in & merge →"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

/* --- EXISTING LOGGED-IN MATCH --- */
function ExistingMatchState({
  frame,
  invite,
  onConfirm,
}: {
  frame: Frame;
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
    <AuthLayout
      {...frame}
      title={<>Add {invite.siteDisplayName} to your account?</>}
      intro={<>You&rsquo;ll be able to file tickets for this site alongside your existing sites.</>}
    >
      <Particulars
        rows={[
          { label: "Site to add", value: <SiteValue invite={invite} /> },
          { label: "Account", value: <EmailValue email={invite.email} /> },
        ]}
      />

      <div className="flex items-center justify-end gap-3">
        <a href="/portal/dashboard" className="btn-ghost">
          Cancel
        </a>
        <button type="button" onClick={handle} disabled={submitting} className="btn-dispatch">
          {submitting ? "Adding…" : "Add site →"}
        </button>
      </div>
    </AuthLayout>
  );
}

/* --- MISMATCH --- */
function MismatchState({
  frame,
  invite,
  currentSessionEmail,
  onSignOut,
}: {
  frame: Frame;
  invite: InviteData;
  currentSessionEmail: string;
  onSignOut?: () => void | Promise<void>;
}) {
  return (
    <AuthLayout
      {...frame}
      title={
        <>
          This invite isn&rsquo;t for
          <br className="hidden lg:inline" />
          your current account.
        </>
      }
      intro={
        <>
          You&rsquo;re signed in as <strong>{currentSessionEmail}</strong>, but this invite
          was sent to <strong>{invite.email}</strong>. Sign out and click the invite
          link again, or contact me if this is a mistake.
        </>
      }
    >
      <Particulars
        rows={[
          { label: "Invite is for", value: <EmailValue email={invite.email} /> },
          { label: "You're signed in as", value: <EmailValue email={currentSessionEmail} /> },
        ]}
      />

      <div className="flex items-center justify-end gap-3">
        <a href="/portal/dashboard" className="btn-ghost">
          Stay signed in
        </a>
        <button type="button" onClick={onSignOut} className="btn-dispatch">
          Sign out & retry →
        </button>
      </div>
    </AuthLayout>
  );
}
