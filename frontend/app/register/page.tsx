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

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  // Batch 24: registration is now a request, not an instant sign-in. On success we
  // show a "pending approval" confirmation instead of redirecting to the dashboard.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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
      <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Request received</CardTitle>
            <CardDescription>Your workspace is pending approval.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="rounded-md border border-stellix-highlight/40 bg-stellix-highlight/5 px-3 py-3 text-sm text-muted-foreground">
              {pendingMessage}
            </p>
            <p className="text-sm text-muted-foreground">
              You&apos;ll be able to sign in as soon as our team activates your
              organization. We&apos;ll be in touch shortly.
            </p>
            <Link href="/login" className={buttonVariants()}>
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            You&apos;ll be the admin of a new Stellix Labs workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <Field label="Organization name" error={errors.organization_name?.message}>
              <Input placeholder="Acme Capital" {...register("organization_name")} />
            </Field>
            <Field label="Full name (optional)" error={errors.full_name?.message}>
              <Input placeholder="Jane Researcher" {...register("full_name")} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="admin@acme.com" {...register("email")} />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <Input type="password" placeholder="At least 10 chars, 1 number" {...register("password")} />
            </Field>

            {serverError && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create organization"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-stellix-highlight hover:underline">
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
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
