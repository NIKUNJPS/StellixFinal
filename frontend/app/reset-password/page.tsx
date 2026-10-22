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
import { resetPassword } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell eyebrow="Password reset" title={<>Invalid reset <em>link.</em></>}>
        <AuthAlert tone="error">This link is missing its reset token.</AuthAlert>
        <Link href="/forgot-password" className={`${authButtonClass} mt-5`}>
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title={
        <>
          Choose a new <em>password.</em>
        </>
      }
      description="At least 10 characters, including one number."
      footer={
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <AuthAlert tone="success">Password reset — redirecting to sign in…</AuthAlert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <AuthField label="New password" htmlFor="rp-new">
            <Input
              id="rp-new"
              type="password"
              autoComplete="new-password"
              placeholder="At least 10 chars, 1 number"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          <AuthField label="Confirm new password" htmlFor="rp-confirm">
            <Input
              id="rp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          {error && <AuthAlert tone="error">{error}</AuthAlert>}
          <button type="submit" disabled={busy || !newPassword} className={authButtonClass}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
