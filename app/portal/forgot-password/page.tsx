import { ForgotPasswordForm } from "./forgot-password-form";
import { Masthead } from "@/components/Masthead";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Masthead />
      <main className="flex-1 flex items-start md:items-center justify-center px-5 py-10 md:py-16">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
              §02
            </span>
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
              Reset Credentials
            </span>
          </div>

          <h2
            className="font-display text-3xl md:text-4xl leading-[1.05] mb-3"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Lost your sign-in?
            <br />
            <span className="italic text-signal-red">We&rsquo;ll wire you a link.</span>
          </h2>
          <p className="font-display text-ink-mute italic mb-10">
            Enter the email on file. If we have a record, you&rsquo;ll receive a reset
            <br />
            <span className="text-ink-soft">link within a minute or two.</span>
          </p>

          <ForgotPasswordForm />

          <div className="mt-16 pt-6 rule-thin">
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade leading-relaxed">
              <a href="/portal" className="hover:text-signal-red transition-colors underline-offset-4 hover:underline">
                ← Back to sign-in
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
