import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

// A dark wash from the bottom and the left so a light headline reads over the
// photo when it fills one half of the screen.
const SPLIT_SCRIM =
  "linear-gradient(to top, rgb(var(--scrim) / 0.88) 0%, rgb(var(--scrim) / 0.42) 58%, rgb(var(--scrim) / 0.2) 100%), " +
  "linear-gradient(90deg, rgb(var(--scrim) / 0.6) 0%, rgb(var(--scrim) / 0) 72%)";

// The public page's hero wash, for when the photo fills the whole screen.
const HERO_SCRIM =
  "linear-gradient(90deg, rgb(var(--scrim) / 0.9) 0%, rgb(var(--scrim) / 0.66) 40%, rgb(var(--scrim) / 0.08) 78%), " +
  "linear-gradient(to top, rgb(var(--scrim) / 0.75), transparent 50%)";

export interface AuthLayoutProps {
  /** The screen's headline, set into the photo. Rendered as the page's h1. */
  title: ReactNode;
  /** Quiet line under the headline. */
  intro?: ReactNode;
  /** The form, or for a message screen, its buttons. */
  children: ReactNode;
  /** Small print under the form, above a soft rule. */
  footer?: ReactNode;
  /**
   * `split` puts the form on paper beside the photo. `message` is for screens
   * with nothing to fill in: the photo fills the screen and the headline, intro
   * and buttons sit in it, like the public page's hero.
   */
  variant?: "split" | "message";
  className?: string;
  style?: CSSProperties;
}

/**
 * Frame for every signed-out screen: sign in, password reset, invites and
 * email verification. It matches the Workbench public page, where the hero's
 * desk photo carries the wordmark and the headline. Split screens hold the
 * photo in place beside the form on desktop and stack a photo band above it
 * on phones.
 */
export function AuthLayout({
  title,
  intro,
  children,
  footer,
  variant = "split",
  className = "",
  style,
}: AuthLayoutProps) {
  const heading = (
    <h1 className="font-display text-[clamp(2.5rem,5.2vw,4.75rem)] leading-[1.02] tracking-[-0.02em]">
      {title}
    </h1>
  );

  if (variant === "message") {
    return (
      <main
        className={`relative isolate flex min-h-[100svh] flex-col justify-between overflow-hidden bg-band px-5 pb-14 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] text-onInverse md:px-10 lg:px-14 lg:pb-20 lg:pt-10 ${className}`}
        style={style}
      >
        <DeskPhoto sizes="100vw" scrim={HERO_SCRIM} position="object-[70%_58%] lg:object-[50%_40%]" />
        <HomeMark />
        <div className="mt-14 max-w-[40rem]">
          {heading}
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
    <main
      className={`flex min-h-[100svh] flex-col bg-parchment lg:flex-row ${className}`}
      style={style}
    >
      <div className="relative isolate flex min-h-[21rem] flex-col justify-between overflow-hidden bg-band px-5 pb-9 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] text-onInverse md:px-10 lg:sticky lg:top-0 lg:h-[100svh] lg:w-[55%] lg:px-14 lg:pb-16 lg:pt-10">
        <DeskPhoto
          sizes="(min-width: 1024px) 55vw, 100vw"
          scrim={SPLIT_SCRIM}
          position="object-[70%_58%] lg:object-[58%_42%]"
        />
        <HomeMark />
        <div className="mt-14 max-w-[36rem]">
          {heading}
          {intro && (
            <p className="mt-6 hidden max-w-[30rem] font-display text-lg italic leading-relaxed text-onInverse/85 lg:block">
              {intro}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-5 py-10 md:px-10 lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-md">
          {intro && (
            <p className="mb-9 font-display text-base italic leading-relaxed text-ink-mute lg:hidden">
              {intro}
            </p>
          )}
          {children}
          {footer && <div className="mt-14 border-t border-rule-soft pt-6">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

/**
 * The public page's hero photo with its wash, filling the positioned parent.
 * Its own absolute layer gives next/image a parent position it accepts: the
 * split layout's photo panel is sticky on desktop.
 */
function DeskPhoto({ sizes, scrim, position }: { sizes: string; scrim: string; position: string }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <Image
        src="/images/desk-lamp-coffee.webp"
        alt=""
        fill
        priority
        sizes={sizes}
        className={`object-cover ${position}`}
      />
      <div className="absolute inset-0" style={{ background: scrim }} />
    </div>
  );
}

/** The wordmark, linking back to the public page. */
function HomeMark() {
  return (
    <a href="/" className="wordmark self-start rounded-md text-[1.625rem] text-onInverse">
      Dispatch
      <span aria-hidden="true" className="wordmark-dot" />
    </a>
  );
}

/** A light outline pill for a secondary action set on the photo. */
export const PHOTO_OUTLINE_BUTTON =
  "inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border-[1.5px] border-onInverse/60 px-5 font-mono text-[0.875rem] text-onInverse transition-colors hover:border-onInverse hover:bg-onInverse/10";
