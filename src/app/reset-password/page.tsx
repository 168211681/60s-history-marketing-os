import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { EmptyState, PageHeading, Panel } from "@/components/ui";
import { ownerId, supabaseConfig } from "@/lib/auth/config";
import { hasRecoveryMarker, recoveryCookieName, resetPasswordAccess } from "@/lib/auth/recovery-cookie";
import { currentOwner } from "@/lib/auth/server";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const configured = Boolean(supabaseConfig() && ownerId());
  const owner = configured ? await currentOwner() : null;
  const jar = await cookies();
  const access = resetPasswordAccess({
    configured,
    owner: Boolean(owner),
    recoveryMarker: hasRecoveryMarker(jar.get(recoveryCookieName)?.value),
  });
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Choose a new password"
        description="This page only accepts a password reset link for the channel owner."
      />
      <Panel title="New password">
        {access === "unconfigured" ? (
          <EmptyState title="Password reset is not configured">
            <p>Authentication is not ready for a password change.</p>
          </EmptyState>
        ) : access === "form" && owner ? (
          <ResetPasswordForm ownerId={owner.id} />
        ) : (
          <EmptyState title="Open your reset link">
            <p>Use the password reset email for the owner account. A normal sign-in cannot change the password here.</p>
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
