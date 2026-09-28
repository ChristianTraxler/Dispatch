import { ForgotPasswordForm } from "./forgot-password-form";
import { AuthLayout } from "@/components/AuthLayout";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title={
        <>
          Lost your sign-in?
          <br />
          We&rsquo;ll wire you a link.
        </>
      }
      intro={
        <>
          Enter the email on file. If we have a record, you&rsquo;ll receive a reset link
          within a minute or two.
        </>
      }
      footer={
        <p className="font-mono text-[0.8125rem] text-ink-mute leading-relaxed">
          <a href="/portal" className="hover:text-accent transition-colors underline-offset-4 hover:underline">
            ← Back to sign-in
          </a>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
