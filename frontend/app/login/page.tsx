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
  if (user?.role === "risk_manager") return "/risk-manager/failures";
  if (user?.role === "cio") return "/cio/failures";
  return "/dashboard";
}

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  organization_slug: z.string().optional(),
  remember_me: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

// --- Background Video Component with Subtle Dark Overlay ---
function BackgroundVideo() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 h-full w-full overflow-hidden bg-[#08090B]">
      {/* HTML5 Native Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      >
        <source src="/Bgvideo.mp4" type="video/mp4" />
      </video>

      {/* Ultra-light Cinematic Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, rgba(8, 9, 11, 0.05) 0%, rgba(8, 9, 11, 0.35) 75%, rgba(8, 9, 11, 0.65) 100%)",
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

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
  const emailValue = watch("email");
  const passwordValue = watch("password");
  const slugValue = watch("organization_slug");

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
      setResendNotice(
        err instanceof Error ? err.message : "Failed to resend the link"
      );
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
      <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-16 selection:bg-[#6F6B9B]/30">
        <BackgroundVideo />

        <Card
          className="relative z-10 w-full max-w-[390px] rounded-2xl p-3 shadow-2xl backdrop-blur-sm transition-all duration-200"
          style={{
            backgroundColor: "rgba(15, 17, 21, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            boxShadow:
              "0 20px 60px -15px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
          }}
        >
          <CardHeader className="space-y-1.5 pb-4">
            <CardTitle className="text-xl font-bold tracking-tight text-[#F5F5F7]">
              Two-factor verification
            </CardTitle>
            <CardDescription className="text-sm text-[#9A9DA8]">
              Enter the 6-digit code from your authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              maxLength={6}
              autoFocus
              className="h-12 rounded-xl text-center font-mono text-lg tracking-widest text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:ring-0"
              style={{
                backgroundColor: "rgba(20, 22, 27, 0.15)",
                border: mfaCode
                  ? "1px solid rgba(255, 255, 255, 0.75)"
                  : "1px solid rgba(255, 255, 255, 0.12)",
              }}
            />
            {serverError && (
              <p className="rounded-xl border border-[#E45B5B]/30 bg-[#E45B5B]/10 px-3 py-2 text-sm font-medium text-[#E45B5B]">
                {serverError}
              </p>
            )}
            <Button
              onClick={onSubmitMfa}
              disabled={mfaBusy || mfaCode.length !== 6}
              className="h-12 rounded-xl text-sm font-semibold tracking-wide text-white shadow-sm transition-all duration-200 active:scale-[0.99] disabled:opacity-40"
              style={{
                backgroundColor: "#5C568E",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                boxShadow: "0 4px 22px rgba(92, 86, 142, 0.5)",
              }}
            >
              {mfaBusy ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              className="text-center font-mono text-xs text-[#9A9DA8] transition-colors hover:text-[#F5F5F7]"
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
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-16 selection:bg-[#6F6B9B]/30">
      {/* Full-Screen Animated Network Video Background */}
      <BackgroundVideo />

      <Card
        className="relative z-10 w-full max-w-[390px] rounded-2xl p-3 shadow-2xl backdrop-blur-sm transition-all duration-200"
        style={{
          backgroundColor: "rgba(15, 17, 21, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          boxShadow:
            "0 20px 60px -15px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
        }}
      >
        <CardHeader className="space-y-2 pb-5">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: "#6F6B9B",
                boxShadow: "0 0 8px rgba(111, 107, 155, 0.9)",
              }}
            />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9A9DA8]">
              Platform Access
            </span>
          </div>
          <CardTitle className="text-[28px] font-bold tracking-tight text-[#F5F5F7]">
            Sign in
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed text-[#9A9DA8]">
            Welcome back to Stellix Labs.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {/* Email Field Group */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="login-email-input"
                className="text-sm font-semibold text-[#F5F5F7]"
              >
                Email
              </Label>
              <Input
                id="login-email-input"
                type="email"
                placeholder="admin@acme.com"
                {...register("email")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: emailValue
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
              {errors.email && (
                <span className="font-mono text-xs text-[#E45B5B]">
                  {errors.email.message}
                </span>
              )}
            </div>

            {/* Password Field Group */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="login-password-input"
                className="text-sm font-semibold text-[#F5F5F7]"
              >
                Password
              </Label>
              <Input
                id="login-password-input"
                type="password"
                placeholder="••••••••••"
                {...register("password")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: passwordValue
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
              {errors.password && (
                <span className="font-mono text-xs text-[#E45B5B]">
                  {errors.password.message}
                </span>
              )}
            </div>

            {/* Organization Slug Group */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="login-slug-input"
                className="text-sm font-medium text-[#9A9DA8]"
              >
                Organization slug{" "}
                <span className="text-xs text-[#666A76]">(optional)</span>
              </Label>
              <Input
                id="login-slug-input"
                placeholder="acme-capital"
                {...register("organization_slug")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: slugValue
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#9A9DA8] transition-colors hover:text-[#F5F5F7]">
                <Checkbox
                  checked={!!rememberMe}
                  onCheckedChange={(checked) =>
                    setValue("remember_me", checked === true)
                  }
                  className="h-4 w-4 rounded border-white/[0.25] data-[state=checked]:border-[#5C568E] data-[state=checked]:bg-[#5C568E] data-[state=checked]:text-white"
                />
                Remember me
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-[#9A9DA8] transition-colors hover:text-[#F5F5F7] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {serverError && (
              <p className="rounded-xl border border-[#E45B5B]/30 bg-[#E45B5B]/10 px-3.5 py-2.5 text-sm font-medium text-[#E45B5B]">
                {serverError}
              </p>
            )}

            {unverifiedEmail && (
              <div className="rounded-xl border border-[#E5A84B]/30 bg-[#E5A84B]/10 p-3.5">
                <p className="text-sm text-[#E5A84B]">
                  Didn&apos;t get the email?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-9 rounded-lg border-white/[0.12] bg-[#14161B]/40 text-sm text-[#F5F5F7] hover:bg-[#14161B]"
                  disabled={resendBusy}
                  onClick={() => void onResendVerification()}
                >
                  {resendBusy ? "Sending…" : "Resend verification link"}
                </Button>
                {resendNotice && (
                  <p className="mt-2 font-mono text-xs text-[#9A9DA8]">
                    {resendNotice}
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 h-12 rounded-xl text-sm font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
              style={{
                backgroundColor: "#5C568E",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                boxShadow: "0 4px 22px rgba(92, 86, 142, 0.5)",
              }}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[#666A76]">
            Need an account?{" "}
            <Link
              href="/register"
              className="font-medium text-[#F5F5F7] transition-colors hover:underline"
            >
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}