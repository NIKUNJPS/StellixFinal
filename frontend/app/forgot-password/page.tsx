"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>We&apos;ll send a reset link if that email has an account.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, a password reset link has been sent.
              </p>
              {devResetLink && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs text-amber-500">
                    Dev-only (no email provider configured yet):
                  </p>
                  <Link href={devResetLink} className="break-all text-stellix-highlight hover:underline">
                    {devResetLink}
                  </Link>
                </div>
              )}
              <Link href="/login" className="text-center text-sm text-stellix-highlight hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="admin@acme.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Organization slug (optional)</Label>
                <Input placeholder="acme-capital" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              {error && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy || !email}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
