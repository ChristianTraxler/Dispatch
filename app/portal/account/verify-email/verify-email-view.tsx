import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";

export type VerifyOutcome =
  | { kind: "ok"; newEmail: string }
  | { kind: "invalid" }
  | { kind: "error" };

/**
 * What the verify-email page shows once the token has been checked. Kept apart
 * from the page, which does the actual change, so it renders without side effects.
 */
export function VerifyEmailView({ outcome }: { outcome: VerifyOutcome }) {
  // Sign-in lives at /portal. The old /portal/login link landed on a 404 after signing in.
  const signIn = (
    <Link href="/portal" className="btn-dispatch">
      Sign in
    </Link>
  );

  if (outcome.kind === "ok") {
    return (
      <AuthLayout
        variant="message"
        title="Email updated"
        intro={
          <>
            Your Dispatch login is now <strong>{outcome.newEmail}</strong>. For
            your security, all sessions have been signed out: sign in again
            with the new address.
          </>
        }
      >
        {signIn}
      </AuthLayout>
    );
  }

  if (outcome.kind === "invalid") {
    return (
      <AuthLayout
        variant="message"
        title="Link expired or invalid"
        intro={
          <>
            This verification link can&rsquo;t be used. It may have expired,
            already been used, or been replaced by a newer request. Sign in
            and request the change again if you still need to.
          </>
        }
      >
        {signIn}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="message"
      title="Something went wrong"
      intro={
        <>
          We couldn&rsquo;t finish the change. Try the link again, or
          contact{" "}
          <a href="mailto:hello@developerofcode.com" className="underline underline-offset-4">
            hello@developerofcode.com
          </a>
          .
        </>
      }
    >
      {signIn}
    </AuthLayout>
  );
}
