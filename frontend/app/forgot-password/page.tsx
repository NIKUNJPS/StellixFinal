"use client";

import Link from "next/link";
import { useState } from "react";
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
import { requestPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // Dev-only: no transactional email provider is wired up yet (see
  // docs/schemas.md "PasswordResetToken"). TODO(production): remove this and
  // have the backend send a real email via SendGrid/Resend/etc. instead.
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await requestPasswordReset(email, slug || undefined);
      setDevResetLink(resp.dev_reset_link);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title={
        <>
          Forgot your <em>password?</em>
        </>
      }
      description="Enter your email and we'll send a reset link if it has an account."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className={authLinkClass}>
            Back to sign in
          </Link>
        </>
      }
    >
      {submitted ? (
        <div className="flex flex-col gap-4">
          <AuthAlert tone="success">If an account exists for that email, a password reset link has been sent.</AuthAlert>
          {devResetLink && (
            <AuthAlert tone="warning">
              <span className="block text-[12.5px]">Dev-only (no email provider configured yet):</span>
              <Link href={devResetLink} className="mt-1 block break-all font-code text-[12.5px] text-brand hover:underline">
                {devResetLink}
              </Link>
            </AuthAlert>
          )}
          <Link href="/login" className={authButtonClass}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <AuthField label="Email" htmlFor="fp-email">
            <Input
              id="fp-email"
              type="email"
              autoComplete="email"
              placeholder="you@yourfirm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={authInputClass}
            />
          </AuthField>
          <AuthField label="Organization slug" htmlFor="fp-slug" optional>
            <Input id="fp-slug" placeholder="acme-capital" value={slug} onChange={(e) => setSlug(e.target.value)} className={authInputClass} />
          </AuthField>
          {error && <AuthAlert tone="error">{error}</AuthAlert>}
          <button type="submit" disabled={busy || !email} className={authButtonClass}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
