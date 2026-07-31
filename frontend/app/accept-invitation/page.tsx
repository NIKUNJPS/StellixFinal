"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
import { acceptInvitation } from "@/lib/auth";

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await acceptInvitation(token, password, fullName);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept this invitation");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Invalid invitation link</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This link is missing its invitation token. Ask your administrator to send a
            new invitation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Join your team</CardTitle>
        <CardDescription>
          Set a password to activate your Stellix Labs seat. Your role has already been
          assigned by the administrator who invited you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-emerald-500">
            Welcome aboard — redirecting to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">Full name</Label>
              <Input
                id="invite-name"
                placeholder="Jane Quant"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-password">Password</Label>
              <Input
                id="invite-password"
                type="password"
                placeholder="At least 10 chars, 1 number"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-confirm">Confirm password</Label>
              <Input
                id="invite-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !password}>
              {busy ? "Joining…" : "Accept invitation"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-stellix-highlight hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitationPage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-md items-center justify-center py-16">
      <Suspense fallback={null}>
        <AcceptInvitationForm />
      </Suspense>
    </main>
  );
}
