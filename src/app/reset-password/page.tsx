import { ResetPasswordForm } from "@/components/reset-password-form";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ownerId, supabaseConfig } from "@/lib/auth/config";
import { currentOwner } from "@/lib/auth/server";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const configured = Boolean(supabaseConfig() && ownerId());
  const owner = configured ? await currentOwner() : null;
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Choose a new password"
        description="This page only accepts a password reset link for the channel owner."
      />
      <Panel title="New password">
        {!configured ? (
          <EmptyState title="Password reset is not configured">
            <p>Authentication is not ready for a password change.</p>
          </EmptyState>
        ) : !owner ? (
          <EmptyState title="Open your reset link">
            <p>Use the password reset email for the owner account. This page does not change a password without that session.</p>
          </EmptyState>
        ) : (
          <ResetPasswordForm ownerId={owner.id} />
        )}
      </Panel>
    </>
  );
}
