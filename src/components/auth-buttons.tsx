"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserAuth } from "@/lib/auth/browser";

export function SignInButton() {
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function signIn() {
    setPending(true);
    setError(false);
    const { error } = await browserAuth().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(true);
      setPending(false);
    }
  }
  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(false);
    const { error } = await browserAuth().auth.signInWithPassword({ email, password });
    if (error) {
      setError(true);
      setPending(false);
      return;
    }
    window.location.reload();
  }
  return (
    <div>
      <button className="button" type="button" onClick={signIn} disabled={pending}>
        {pending ? "Opening Google…" : "Sign in with Google"}
      </button>
      <p className="muted">Or use the email/password account created in Supabase.</p>
      <form className="settings-actions" onSubmit={signInWithPassword}>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
        </label>
        <button className="button secondary" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in with email"}
        </button>
      </form>
      {error ? <p role="alert">Sign-in could not start. Check the authentication setup.</p> : null}
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
