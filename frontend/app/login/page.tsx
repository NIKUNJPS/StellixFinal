"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  AuthShell,
  authButtonClass,
  authInputClass,
  authLinkClass,
  authSecondaryButtonClass,
} from "@/components/auth/auth-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { completeMfaLogin, loginUser, resendVerification } from "@/lib/auth";
import type { LoginError } from "@/lib/auth-types";
import { useAuthStore } from "@/store/auth-store";

/** Superadmins land on founder console; compliance officers land on compliance governance; others on dashboard. */
function postLoginPath(): string {
  const user = useAuthStore.getState().user;
  if (user?.is_super_admin) return "/superadmin";
  return "/dashboard";
}

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
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
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSlug, setShowSlug] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { remember_me: false },
  });

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
      <AuthShell
        aside="signin"
        eyebrow="Two-factor verification"
        title={
          <>
            One more <em>step.</em>
          </>
        }
        description="Enter the 6-digit code from your authenticator app."
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmitMfa();
          }}
        >
          <AuthField label="Authentication code" htmlFor="mfa-code">
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
              maxLength={6}
              autoFocus
              className={`${authInputClass} h-14 text-center font-code text-[22px] tracking-[0.5em]`}
            />
          </AuthField>
          {serverError && <AuthAlert tone="error">{serverError}</AuthAlert>}
          <button type="submit" disabled={mfaBusy || mfaCode.length !== 6} className={authButtonClass}>
            {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mfaBusy ? "Verifying…" : "Verify and sign in"}
          </button>
          <button
            type="button"
            className={authSecondaryButtonClass}
            onClick={() => {
              setChallengeToken(null);
              setMfaCode("");
              setServerError(null);
            }}
          >
            Back to sign in
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside="signin"
      eyebrow="Sign in"
      title={
        <>
          Welcome <em>back.</em>
        </>
      }
      description="Sign in to your Stellix Labs workspace."
      footer={
        <>
          New to Stellix Labs?{" "}
          <Link href="/register" className={authLinkClass}>
            Create a workspace
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <AuthField label="Work email" htmlFor="login-email-input" error={errors.email?.message}>
          <Input
            id="login-email-input"
            type="email"
            autoComplete="email"
            placeholder="you@yourfirm.com"
            aria-invalid={!!errors.email}
            {...register("email")}
            className={authInputClass}
          />
        </AuthField>

        <AuthField
          label="Password"
          htmlFor="login-password-input"
          error={errors.password?.message}
          action={
            <Link href="/forgot-password" className="text-[13.5px] font-semibold text-brand hover:underline">
              Forgot password?
            </Link>
          }
        >
          <div className="relative">
            <Input
              id="login-password-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••"
              aria-invalid={!!errors.password}
              {...register("password")}
              className={`${authInputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </AuthField>

        {showSlug ? (
          <AuthField label="Organization slug" htmlFor="login-slug-input" optional hint="Only needed if your email belongs to more than one organization.">
            <Input id="login-slug-input" placeholder="acme-capital" {...register("organization_slug")} className={authInputClass} />
          </AuthField>
        ) : (
          <button type="button" onClick={() => setShowSlug(true)} className="-mt-1 self-start text-[13.5px] font-medium text-ink-2 hover:text-brand">
            + Sign in to a specific organization
          </button>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium text-ink-2">
          <Checkbox
            checked={!!rememberMe}
            onCheckedChange={(checked) => setValue("remember_me", checked === true)}
            className="h-[18px] w-[18px] rounded-[5px] border-line-strong bg-paper-raised data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-white"
          />
          Keep me signed in on this device
        </label>

        {serverError && <AuthAlert tone="error">{serverError}</AuthAlert>}

        {unverifiedEmail && (
          <AuthAlert tone="warning">
            <span className="block">Your email isn&apos;t verified yet. Didn&apos;t get the link?</span>
            <button
              type="button"
              className="mt-2 inline-flex h-9 items-center rounded-full border border-signal/60 bg-paper-raised px-4 text-[13.5px] font-semibold text-ink hover:border-ink"
              disabled={resendBusy}
              onClick={() => void onResendVerification()}
            >
              {resendBusy ? "Sending…" : "Resend verification link"}
            </button>
            {resendNotice && <p className="mt-2 text-[13px] font-normal">{resendNotice}</p>}
          </AuthAlert>
        )}

        <button type="submit" disabled={isSubmitting} className={`${authButtonClass} group mt-1`}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>
    </AuthShell>
  );
}
