"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerOrg } from "@/lib/auth";

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

      {/* Ultra-light Cinematic Vignette so the video remains completely unobstructed */}
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

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  // Batch 24: registration is now a request, not an instant sign-in. On success we
  // show a "pending approval" confirmation instead of redirecting to the dashboard.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const orgNameVal = watch("organization_name");
  const fullNameVal = watch("full_name");
  const emailVal = watch("email");
  const passwordVal = watch("password");

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
              Request received
            </CardTitle>
            <CardDescription className="text-sm text-[#9A9DA8]">
              Your workspace is pending approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p
              className="rounded-xl p-3.5 text-sm leading-relaxed text-[#F5F5F7]"
              style={{
                backgroundColor: "rgba(92, 86, 142, 0.15)",
                border: "1px solid rgba(92, 86, 142, 0.35)",
              }}
            >
              {pendingMessage}
            </p>
            <p className="text-sm leading-relaxed text-[#9A9DA8]">
              You&apos;ll be able to sign in as soon as our team activates your
              organization. We&apos;ll be in touch shortly.
            </p>
            <Link
              href="/login"
              className={buttonVariants({
                className:
                  "mt-2 h-12 w-full rounded-xl text-sm font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.99]",
              })}
              style={{
                backgroundColor: "#5C568E",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                boxShadow: "0 4px 22px rgba(92, 86, 142, 0.5)",
              }}
            >
              Back to sign in
            </Link>
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
            Create your organization
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed text-[#9A9DA8]">
            You&apos;ll be the admin of a new Stellix Labs workspace.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <Field
              label="Organization name"
              error={errors.organization_name?.message}
            >
              <Input
                placeholder="Acme Capital"
                {...register("organization_name")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: orgNameVal
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
            </Field>

            <Field
              label="Full name (optional)"
              error={errors.full_name?.message}
              isOptional
            >
              <Input
                placeholder="Jane Researcher"
                {...register("full_name")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: fullNameVal
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
            </Field>

            <Field label="Email" error={errors.email?.message}>
              <Input
                type="email"
                placeholder="admin@acme.com"
                {...register("email")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: emailVal
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
            </Field>

            <Field label="Password" error={errors.password?.message}>
              <Input
                type="password"
                placeholder="At least 10 chars, 1 number"
                {...register("password")}
                className="h-11 rounded-xl text-sm text-[#F5F5F7] placeholder:text-[#666A76] transition-all duration-150 focus:border-white focus:outline-none focus:ring-0 focus-visible:border-white focus-visible:ring-0"
                style={{
                  backgroundColor: "rgba(20, 22, 27, 0.15)",
                  border: passwordVal
                    ? "1px solid rgba(255, 255, 255, 0.75)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                }}
              />
            </Field>

            {serverError && (
              <p className="rounded-xl border border-[#E45B5B]/30 bg-[#E45B5B]/10 px-3.5 py-2.5 text-sm font-medium text-[#E45B5B]">
                {serverError}
              </p>
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
              {isSubmitting ? "Creating…" : "Create organization"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[#666A76]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[#F5F5F7] transition-colors hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  label,
  error,
  isOptional,
  children,
}: {
  label: string;
  error?: string;
  isOptional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-[#F5F5F7]">
        {label}
        {isOptional && (
          <span className="ml-1 text-xs font-normal text-[#666A76]">(optional)</span>
        )}
      </Label>
      {children}
      {error && <span className="font-mono text-xs text-[#E45B5B]">{error}</span>}
    </div>
  );
}