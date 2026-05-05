"use client";

import { useState } from "react";
import { Masthead } from "./Masthead";

export interface LoginPageProps {
  /** Hook for the demo to receive submitted values; in production this calls /api/portal/auth/login */
  onSubmit?: (data: { email: string; password: string }) => void | Promise<void>;
  /** Server error to display (e.g., "Invalid credentials") */
  error?: string;
}

export function LoginPage({ onSubmit, error }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ email, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Masthead />

      <main className="flex-1 flex items-start md:items-center justify-center px-5 py-10 md:py-16">
        <div className="w-full max-w-md">
          {/* Section label */}
          <div className="flex items-center gap-3 mb-8">
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
              §01
            </span>
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
              Authorized Access
            </span>
          </div>

          {/* Headline */}
          <h2
            className="font-display text-3xl md:text-4xl leading-[1.05] mb-3"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Sign in to file
            <br />
            <span className="italic text-signal-red">a new dispatch.</span>
          </h2>
          <p className="font-display text-ink-mute italic mb-10">
            Use the credentials sent with your invitation. New here?
            <br />
            <span className="text-ink-soft">Look for an invite link in your inbox.</span>
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-7">
            <div>
              <label
                htmlFor="email"
                className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                required
                autoComplete="email"
                className="input-line"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="input-line"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="border-l-[3px] border-signal-red bg-signal-red/5 px-4 py-3 font-mono text-xs uppercase tracking-wider text-signal-redDeep"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 pt-2">
              <a
                href="/portal/forgot-password"
                className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors underline-offset-4 hover:underline"
              >
                Forgot password?
              </a>

              <button type="submit" disabled={submitting} className="btn-dispatch">
                {submitting ? "Signing in…" : "Sign in →"}
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-16 pt-6 rule-thin">
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade leading-relaxed">
              Developer of Code, LLC ── Support Desk
              <br />
              No public submissions. Invite only.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
