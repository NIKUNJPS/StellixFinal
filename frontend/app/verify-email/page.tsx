"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  AuthShell,
  authButtonClass,
  authInputClass,
  authLinkClass,
  authSecondaryButtonClass,
} from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { resendVerification, verifyEmail } from "@/lib/auth";

type State = "working" | "confirmed" | "failed";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<State>(token ? "working" : "failed");
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its verification token.");

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
      <AuthShell eyebrow="Email verification" title={<>Confirming your <em>email…</em></>}>
        <div className="flex items-center gap-3 text-[15px] text-ink-2">
          <Loader2 className="h-5 w-5 animate-spin text-brand" /> One moment.
        </div>
      </AuthShell>
    );
  }

  if (state === "confirmed") {
    return (
      <AuthShell eyebrow="Email verification" title={<>Email <em>confirmed.</em></>} description="Your address is verified.">
        <div className="flex flex-col gap-5">
          <AuthAlert tone="success">
            You can now sign in. If your organization is still awaiting approval, you&apos;ll be able to sign in as soon as it is
            approved.
          </AuthAlert>
          <button type="button" className={authButtonClass} onClick={() => router.push("/login")}>
            Go to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Email verification"
      title={<>Verification <em>failed.</em></>}
      description="This link may have expired or already been used."
      footer={
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <AuthAlert tone="error">{error}</AuthAlert>}
        <form onSubmit={onResend} className="flex flex-col gap-4" noValidate>
          <AuthField label="Send a new link" htmlFor="verify-resend-email">
            <Input
              id="verify-resend-email"
              type="email"
              autoComplete="email"
              placeholder="you@yourfirm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          <button type="submit" disabled={resendBusy || !email} className={authSecondaryButtonClass}>
            {resendBusy ? "Sending…" : "Resend verification link"}
          </button>
        </form>
        {resendMessage && <AuthAlert tone="info">{resendMessage}</AuthAlert>}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
