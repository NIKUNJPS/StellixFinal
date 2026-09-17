"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/hooks/use-permissions";
import { PERM } from "@/lib/rbac";
import {
  previewWeeklyDigest,
  setWeeklyDigestEnabled,
  type WeeklyDigestContent,
} from "@/lib/organization";
import { useAuthStore } from "@/store/auth-store";

export function DigestCard() {
  const { user, organization, setSession } = useAuthStore();
  const canManageOrganization = useCan(PERM.ORGANIZATION_MANAGE);
  const canSendDigest = useCan(PERM.DIGEST_SEND);
  const [preview, setPreview] = useState<WeeklyDigestContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user || !organization) return null;
  const isAdmin = canManageOrganization;

  async function toggle(enabled: boolean) {
    if (!user || !organization) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await setWeeklyDigestEnabled(enabled);
      setSession(user, updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update preference");
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewWeeklyDigest());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build preview");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-stellix-highlight" />
          Weekly digest
        </CardTitle>
        <CardDescription>
          A Monday summary of your week: new strategies, failures, regime changes, evolution
          runs, and portfolio Sharpe. Delivered to your organization&apos;s notification channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable weekly digest</p>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Applies to the whole organization." : "Only an admin can change this."}
            </p>
          </div>
          <Switch
            checked={organization.weekly_digest_enabled}
            onCheckedChange={toggle}
            disabled={!isAdmin || saving}
          />
        </div>

        {canSendDigest && (
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={runPreview} disabled={busy}>
              {busy ? "Building…" : "Preview this week's digest"}
            </Button>
            <span className="text-xs text-muted-foreground">
              No email inbox in this environment — the digest renders below.
            </span>
          </div>
        )}

        {preview && (
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <p className="text-sm font-semibold">{preview.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted-foreground">
              {preview.body}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
