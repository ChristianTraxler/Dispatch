import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

// The public page's hero wash, for when the photo fills the whole screen.
const HERO_SCRIM =
  "linear-gradient(90deg, rgb(var(--scrim) / 0.9) 0%, rgb(var(--scrim) / 0.66) 40%, rgb(var(--scrim) / 0.08) 78%), " +
  "linear-gradient(to top, rgb(var(--scrim) / 0.75), transparent 50%)";

export interface AuthLayoutProps {
  /** The screen's headline. Rendered as the page's h1. */
  title: ReactNode;
  /** Quiet line under the headline. */
  intro?: ReactNode;
  /** The form, or for a message screen, its buttons. */
  children: ReactNode;
  /** Small print under the form, above a soft rule. */
  footer?: ReactNode;
  /**
   * `sheet` looks like the public page with its sign-in panel open: the desk
   * photo dimmed behind a paper sheet that slides in from the right and holds
   * the form. `message` is for screens with nothing to fill in: the photo
   * fills the screen and the headline, intro and buttons sit in it, like the
   * public page's hero.
   */
  variant?: "sheet" | "message";
  className?: string;
  style?: CSSProperties;
}

/**
 * Frame for the signed-out screens that live in the app: password reset,
 * invites and email verification. Signing in itself happens in the panel on
 * the public page, and this matches it.
 */
export function AuthLayout({
  title,
  intro,
  children,
  footer,
  variant = "sheet",
  className = "",
  style,
}: AuthLayoutProps) {
  if (variant === "message") {
    return (
      <main
        className={`relative isolate flex min-h-[100svh] flex-col justify-between overflow-hidden bg-band px-5 pb-14 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] text-onInverse md:px-10 lg:px-14 lg:pb-20 lg:pt-10 ${className}`}
        style={style}
      >
        <DeskPhoto />
        <HomeMark className="self-start text-onInverse" />
        <div className="mt-14 max-w-[40rem]">
          <h1 className="font-display text-[clamp(2.5rem,5.2vw,4.75rem)] leading-[1.02] tracking-[-0.02em]">
            {title}
          </h1>
          {intro && (
            <p className="mt-6 max-w-[34rem] font-display text-lg italic leading-relaxed text-onInverse/85">
              {intro}
            </p>
          )}
          <div className="mt-10 flex flex-wrap items-center gap-3">{children}</div>
          {footer && <div className="mt-10 text-onInverse/70">{footer}</div>}
        </div>
      </main>
    );
  }

  return (
    <main className={`relative isolate min-h-[100svh] bg-band ${className}`} style={style}>
      {/* The photo, dimmed the way the public page dims behind its panel. */}
      <div aria-hidden="true" className="fixed inset-0 -z-10">
        <DeskPhoto />
        <div className="absolute inset-0 animate-dim-in bg-[rgb(var(--scrim)/0.6)] motion-reduce:animate-none" />
      </div>
      <HomeMark className="absolute left-5 top-[calc(env(safe-area-inset-top,0px)+1.25rem)] hidden text-onInverse sm:inline-flex md:left-10 lg:left-14 lg:top-10" />

      <div
        className="ml-auto flex min-h-[100svh] w-full animate-sheet-in flex-col bg-parchment text-ink shadow-[-24px_0_60px_-30px_rgb(var(--scrim)/0.6)] motion-reduce:animate-none sm:max-w-[31rem]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex h-[76px] flex-none items-center justify-between px-6 sm:justify-end sm:px-10">
          <HomeMark className="text-ink sm:hidden" />
          <a
            href="/"
            className="inline-flex min-h-[2.75rem] items-center rounded-full px-3 font-mono text-[0.9375rem] text-ink"
          >
            Close
          </a>
        </div>

        <div className="flex flex-1 flex-col justify-center px-6 pb-14 pt-2 sm:px-10">
          <h1 className="font-display text-[clamp(2.375rem,4vw,3.25rem)] leading-[1.04] tracking-[-0.02em]">
            {title}
          </h1>
          {intro && <p className="mb-10 mt-5 text-ink-mute leading-relaxed">{intro}</p>}
          {children}
          {footer && <div className="mt-14 border-t border-rule-soft pt-6">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

/**
 * The public page's hero photo with its wash, filling the positioned parent.
 * Its own absolute layer gives next/image a parent position it accepts.
 */
function DeskPhoto() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <Image
        src="/images/desk-lamp-coffee.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[70%_58%] lg:object-[50%_40%]"
      />
      <div className="absolute inset-0" style={{ background: HERO_SCRIM }} />
    </div>
  );
}

/** The wordmark, linking back to the public page. */
function HomeMark({ className = "" }: { className?: string }) {
  return (
    <a href="/" className={`wordmark rounded-md text-[1.625rem] ${className}`}>
      Dispatch
      <span aria-hidden="true" className="wordmark-dot" />
    </a>
  );
}

/** A light outline pill for a secondary action set on the photo. */
export const PHOTO_OUTLINE_BUTTON =
  "inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border-[1.5px] border-onInverse/60 px-5 font-mono text-[0.875rem] text-onInverse transition-colors hover:border-onInverse hover:bg-onInverse/10";
