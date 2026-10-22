"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  AuthShell,
  authButtonClass,
  authInputClass,
  authLinkClass,
} from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { acceptInvitation } from "@/lib/auth";

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await acceptInvitation(token, password, fullName);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept this invitation");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell aside="signup" eyebrow="Team invitation" title={<>Invalid invitation <em>link.</em></>}>
        <AuthAlert tone="error">
          This link is missing its invitation token. Ask your administrator to send a new invitation.
        </AuthAlert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside="signup"
      eyebrow="Team invitation"
      title={
        <>
          Join your <em>team.</em>
        </>
      }
      description="Set a password to activate your seat. Your role has already been assigned by the administrator who invited you."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      {done ? (
        <AuthAlert tone="success">Welcome aboard — redirecting to sign in…</AuthAlert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <AuthField label="Full name" htmlFor="invite-name">
            <Input
              id="invite-name"
              autoComplete="name"
              placeholder="Jane Quant"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          <AuthField label="Password" htmlFor="invite-password" hint="At least 10 characters, including one number.">
            <Input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          <AuthField label="Confirm password" htmlFor="invite-confirm">
            <Input
              id="invite-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          {error && <AuthAlert tone="error">{error}</AuthAlert>}
          <button type="submit" disabled={busy || !password} className={authButtonClass}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Joining…" : "Accept invitation"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
