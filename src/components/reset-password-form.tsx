"use client";

import { useState, type FormEvent } from "react";
import { browserAuth } from "@/lib/auth/browser";
import { changeOwnerPassword, validateNewPassword } from "@/lib/auth/recovery";

export function ResetPasswordForm({ ownerId }: { ownerId: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const auth = browserAuth();
      const result = await changeOwnerPassword(auth.auth, { password, confirm, ownerId });
      if (!result.ok) {
        setMessage(result.error);
        setPending(false);
        return;
      }
      window.location.assign(result.redirect);
    } catch {
      setMessage("The password could not be changed. Request a new reset link and try again.");
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        New password
        <input
          type="password"
          name="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          name="confirm-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>
      <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Update password"}</button>
      {message ? <p role="alert">{message}</p> : null}
    </form>
  );
}
