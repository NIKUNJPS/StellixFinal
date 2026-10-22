"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Check, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  AuthShell,
  authButtonClass,
  authInputClass,
  authLinkClass,
} from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { registerOrg } from "@/lib/auth";
import { cn } from "@/lib/utils";

// Mirrors the backend password rule: ≥10 chars and at least one number.
const schema = z.object({
  organization_name: z.string().min(1, "Organization name is required"),
  full_name: z.string().optional(),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .regex(/\d/, "Must include at least one number"),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  // Batch 24: registration is now a request, not an instant sign-in. On success we
  // show a "pending approval" confirmation instead of redirecting to the dashboard.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const passwordVal = watch("password") ?? "";
  const rules = [
    { label: "10+ characters", ok: passwordVal.length >= 10 },
    { label: "At least one number", ok: /\d/.test(passwordVal) },
  ];

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await registerOrg(values);
      setPendingMessage(result.message);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  if (pendingMessage) {
    return (
      <AuthShell
        aside="signup"
        eyebrow="Request received"
        title={
          <>
            You&apos;re on the <em>list.</em>
          </>
        }
        description="Your workspace is pending approval."
      >
        <div className="flex flex-col gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gain-tint text-gain">
            <MailCheck className="h-7 w-7" />
          </div>
          <AuthAlert tone="info">{pendingMessage}</AuthAlert>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Check your inbox to verify your email. You&apos;ll be able to sign in as soon as our team activates your
            organization — we&apos;ll be in touch shortly.
          </p>
          <Link href="/login" className={authButtonClass}>
            Back to sign in
          </Link>
          <Link href="/" className="text-center text-[14px] font-medium text-ink-2 hover:text-brand">
            Return to the website
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      aside="signup"
      eyebrow="Create a workspace"
      title={
        <>
          Start remembering <em>what failed.</em>
        </>
      }
      description="Set up your organization. You'll be its first admin and can invite your team after approval."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <AuthField label="Organization name" htmlFor="reg-org" error={errors.organization_name?.message}>
          <Input
            id="reg-org"
            placeholder="Acme Capital"
            autoComplete="organization"
            aria-invalid={!!errors.organization_name}
            {...register("organization_name")}
            className={authInputClass}
          />
        </AuthField>

        <AuthField label="Full name" htmlFor="reg-name" optional error={errors.full_name?.message}>
          <Input id="reg-name" placeholder="Jane Researcher" autoComplete="name" {...register("full_name")} className={authInputClass} />
        </AuthField>

        <AuthField label="Work email" htmlFor="reg-email" error={errors.email?.message}>
          <Input
            id="reg-email"
            type="email"
            placeholder="jane@acmecapital.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register("email")}
            className={authInputClass}
          />
        </AuthField>

        <AuthField label="Password" htmlFor="reg-password" error={errors.password?.message}>
          <div className="relative">
            <Input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              autoComplete="new-password"
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
          <ul className="flex flex-wrap gap-2" aria-label="Password requirements">
            {rules.map((r) => (
              <li
                key={r.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                  r.ok ? "border-gain/25 bg-gain-tint text-gain" : "border-line bg-paper-sunken text-ink-3",
                )}
              >
                <Check className={cn("h-3 w-3", r.ok ? "opacity-100" : "opacity-40")} strokeWidth={3} />
                {r.label}
              </li>
            ))}
          </ul>
        </AuthField>

        {serverError && <AuthAlert tone="error">{serverError}</AuthAlert>}

        <button type="submit" disabled={isSubmitting} className={`${authButtonClass} group mt-1`}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Creating workspace…" : "Create workspace"}
          {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </button>

        <p className="text-center text-[13px] leading-relaxed text-ink-3">
          By creating a workspace you agree to our{" "}
          <Link href="/docs#terms" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/docs#privacy" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
