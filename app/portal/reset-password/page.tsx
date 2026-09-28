import { ResetPasswordForm } from "./reset-password-form";
import { AuthLayout } from "@/components/AuthLayout";

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title={
        <>
          New password,
          <br />
          filed and signed.
        </>
      }
      intro={<>Choose something you&rsquo;ll remember. Twelve characters or more.</>}
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
