"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserAuth } from "@/lib/auth/browser";

export function SignInButton() {
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
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
  return (
    <div>
      <button className="button" type="button" onClick={signIn} disabled={pending}>
        {pending ? "Opening Google…" : "Sign in with Google"}
      </button>
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
