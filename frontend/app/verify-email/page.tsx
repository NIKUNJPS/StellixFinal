"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

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
import { resendVerification, verifyEmail } from "@/lib/auth";

type State = "working" | "confirmed" | "failed";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<State>(token ? "working" : "failed");
  const [error, setError] = useState<string | null>(
    token ? null : "This link is missing its verification token.",
  );

  // Resend sub-form, shown once the link has failed.
  const [email, setEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // React 18 StrictMode double-invokes effects in dev; the token is single-use, so
  // a second POST would 400 and wrongly flip a successful confirmation to failed.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    verifyEmail(token)
      .then(() => setState("confirmed"))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not confirm this email");
        setState("failed");
      });
  }, [token]);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setResendBusy(true);
    setResendMessage(null);
    try {
      const res = await resendVerification(email);
      setResendMessage(res.message);
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setResendBusy(false);
    }
  }

  if (state === "working") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Confirming your email…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">One moment.</p>
        </CardContent>
      </Card>
    );
  }

  if (state === "confirmed") {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Email confirmed</CardTitle>
          <CardDescription>Your address is verified.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-emerald-500">
            You can now sign in. If your organization is still awaiting approval,
            you&apos;ll be able to sign in as soon as it is approved.
          </p>
          <Button type="button" onClick={() => router.push("/login")}>
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Verification failed</CardTitle>
        <CardDescription>This link may have expired or already been used.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <form onSubmit={onResend} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-resend-email">Send a new link</Label>
            <Input
              id="verify-resend-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={resendBusy || !email}>
            {resendBusy ? "Sending…" : "Resend verification link"}
          </Button>
        </form>
        {resendMessage && <p className="text-sm text-muted-foreground">{resendMessage}</p>}
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-stellix-highlight hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
      <Suspense fallback={null}>
        <VerifyEmailInner />
      </Suspense>
    </main>
  );
}
