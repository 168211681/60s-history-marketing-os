"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserAuth } from "@/lib/auth/browser";
import { passwordSignInMessage, recoveryRedirect, recoveryRequestMessage, signInFailureMessage } from "@/lib/auth/recovery";

export function SignInButton() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"google" | "password" | "reset" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function signIn() {
    setPending("google");
    setError(null);
    setNotice(null);
    try {
      const { error: oauthError } = await browserAuth().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) {
        setError(signInFailureMessage("setup"));
        setPending(null);
      }
    } catch {
      setError(signInFailureMessage("setup"));
      setPending(null);
    }
  }
  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("password");
    setError(null);
    setNotice(null);
    try {
      const { error: passwordError } = await browserAuth().auth.signInWithPassword({ email, password });
      if (passwordError) {
        setError(passwordSignInMessage(passwordError));
        setPending(null);
        return;
      }
      window.location.reload();
    } catch {
      setError(signInFailureMessage("setup"));
      setPending(null);
    }
  }
  async function forgotPassword() {
    setError(null);
    setNotice(null);
    const trimmed = email.trim();
    if (!trimmed.includes("@") || trimmed.length > 320) {
      setError("Enter an email address.");
      return;
    }
    setPending("reset");
    try {
      await browserAuth().auth.resetPasswordForEmail(trimmed, {
        redirectTo: recoveryRedirect(window.location.origin),
      });
      setNotice(recoveryRequestMessage());
    } catch {
      setError(signInFailureMessage("setup"));
    } finally {
      setPending(null);
    }
  }
  return (
    <div>
      <button className="button" type="button" onClick={signIn} disabled={pending !== null}>
        {pending === "google" ? "Opening Google…" : "Sign in with Google"}
      </button>
      <p className="muted">Or use the email/password account created in Supabase.</p>
      <form className="auth-form" onSubmit={signInWithPassword}>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
        </label>
        <button className="button secondary" type="submit" disabled={pending !== null}>
          {pending === "password" ? "Signing in…" : "Sign in with email"}
        </button>
        <button className="button secondary" type="button" onClick={() => void forgotPassword()} disabled={pending !== null}>
          Forgot password?
        </button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState(false);
  async function signOut() {
    const { error } = await browserAuth().auth.signOut();
    if (error) setError(true);
    else {
      router.replace("/settings");
      router.refresh();
    }
  }
  return (
    <div>
      <button className="button secondary" type="button" onClick={signOut}>Sign out</button>
      {error ? <p role="alert">Sign-out failed. Please try again.</p> : null}
    </div>
  );
}
