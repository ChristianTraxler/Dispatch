import { ResetPasswordForm } from "./reset-password-form";
import { Masthead } from "@/components/Masthead";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Masthead />
      <main className="flex-1 flex items-start md:items-center justify-center px-5 py-10 md:py-16">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
              §03
            </span>
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
              Set New Credentials
            </span>
          </div>

          <h2
            className="font-display text-3xl md:text-4xl leading-[1.05] mb-3"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            New password,
            <br />
            <span className="italic text-signal-red">filed and signed.</span>
          </h2>
          <p className="font-display text-ink-mute italic mb-10">
            Choose something you&rsquo;ll remember. Twelve characters or more.
          </p>

          <ResetPasswordForm />
        </div>
      </main>
    </div>
  );
}
