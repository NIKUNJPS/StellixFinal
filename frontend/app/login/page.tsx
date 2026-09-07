"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeMfaLogin, loginUser, resendVerification } from "@/lib/auth";
import type { LoginError } from "@/lib/auth-types";
import { useAuthStore } from "@/store/auth-store";

/** Superadmins land on founder console; compliance officers land on compliance governance; others on dashboard. */
function postLoginPath(): string {
  const user = useAuthStore.getState().user;
  if (user?.is_super_admin) return "/superadmin";
  if (user?.role === "compliance_officer") return "/compliance/governance";
  if (user?.role === "researcher") return "/researcher/strategies";
  return "/dashboard";
}

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  // Only needed if the same email exists in more than one organization.
  organization_slug: z.string().optional(),
  remember_me: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  // Set only when login failed specifically because the mailbox isn't confirmed.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { remember_me: false } });

  const rememberMe = watch("remember_me");

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await loginUser({
        email: values.email,
        password: values.password,
        organization_slug: values.organization_slug || undefined,
        remember_me: values.remember_me,
      });
      if (result.mfaRequired) {
        setChallengeToken(result.challengeToken);
        return;
      }
      router.push(postLoginPath());
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Login failed");
      // Batch 25: an unconfirmed mailbox is a fixable state, not a dead end —
      // offer to resend the link inline instead of leaving the user stuck.
      const code = (err as LoginError | undefined)?.code;
      setUnverifiedEmail(code === "EMAIL_NOT_VERIFIED" ? values.email : null);
      setResendNotice(null);
    }
  }

  async function onResendVerification() {
    if (!unverifiedEmail) return;
    setResendBusy(true);
    setResendNotice(null);
    try {
      const res = await resendVerification(unverifiedEmail);
      setResendNotice(res.message);
    } catch (err) {
      setResendNotice(err instanceof Error ? err.message : "Failed to resend the link");
    } finally {
      setResendBusy(false);
    }
  }

  async function onSubmitMfa() {
    if (!challengeToken) return;
    setServerError(null);
    setMfaBusy(true);
    try {
      await completeMfaLogin(challengeToken, mfaCode);
      router.push(postLoginPath());
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setMfaBusy(false);
    }
  }

  if (challengeToken) {
    return (
      <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Two-factor verification</CardTitle>
            <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              maxLength={6}
              autoFocus
            />
            {serverError && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}
            <Button onClick={onSubmitMfa} disabled={mfaBusy || mfaCode.length !== 6}>
              {mfaBusy ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              className="text-center text-sm text-muted-foreground hover:underline"
              onClick={() => {
                setChallengeToken(null);
                setMfaCode("");
              }}
            >
              Back to sign in
            </button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back to Stellix Labs.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="admin@acme.com" {...register("email")} />
              {errors.email && (
                <span className="text-xs text-destructive">{errors.email.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••••" {...register("password")} />
              {errors.password && (
                <span className="text-xs text-destructive">{errors.password.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Organization slug (optional)</Label>
              <Input placeholder="acme-capital" {...register("organization_slug")} />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!rememberMe}
                  onCheckedChange={(checked) => setValue("remember_me", checked === true)}
                />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-sm text-stellix-highlight hover:underline">
                Forgot password?
              </Link>
            </div>

            {serverError && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}

            {unverifiedEmail && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Didn&apos;t get the email?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  disabled={resendBusy}
                  onClick={() => void onResendVerification()}
                >
                  {resendBusy ? "Sending…" : "Resend verification link"}
                </Button>
                {resendNotice && (
                  <p className="mt-2 text-sm text-muted-foreground">{resendNotice}</p>
                )}
              </div>
            )}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Need an account?{" "}
            <Link href="/register" className="text-stellix-highlight hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
