"use client";

import { useEffect, useState } from "react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_BASE_URL } from "@/lib/api";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-key";
import { API_KEY_SCOPES, type ApiKeyRead } from "@/lib/api-key-types";
import { disableMfa, enrollMfa, verifyMfa } from "@/lib/auth";
import { updateOrganization } from "@/lib/organization";
import {
  changePassword,
  listMySessions,
  revokeMySession,
  updatePreferences,
  updateProfile,
  uploadAvatar,
} from "@/lib/user-settings";
import type { SessionRead } from "@/lib/user-settings-types";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/lib/notification-types";
import { UsageTab } from "@/components/settings/usage-tab";
import { DigestCard } from "@/components/settings/digest-card";
import { TeamTab } from "@/components/settings/team-tab";
import { useAuthStore } from "@/store/auth-store";
import { useCan, useCanAny } from "@/hooks/use-permissions";
import { PERM } from "@/lib/rbac";

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function ProfileTab() {
  const { user, organization, setSession } = useAuthStore();
  const canManageOrganization = useCan(PERM.ORGANIZATION_MANAGE);
  const roleName = useAuthStore((st) => st.effectiveRole?.name);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [benchmarkSymbol, setBenchmarkSymbol] = useState(organization?.benchmark_symbol ?? "SPY");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || !organization) return null;
  const isAdmin = canManageOrganization;
  const currentUser = user;
  const currentOrganization = organization;

  async function onSaveProfile() {
    setError(null);
    setSavedMsg(null);
    setBusy(true);
    try {
      const updated = await updateProfile({ full_name: fullName });
      setSession(updated, currentOrganization);
      setSavedMsg("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveBenchmark() {
    setError(null);
    setSavedMsg(null);
    setBusy(true);
    try {
      const updatedOrg = await updateOrganization(benchmarkSymbol);
      setSession(currentUser, updatedOrg);
      setSavedMsg("Benchmark symbol saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save benchmark symbol");
    } finally {
      setBusy(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await uploadAvatar(file);
      setSession(updated, currentOrganization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner message={error} />
        {savedMsg && <p className="text-sm text-emerald-500">{savedMsg}</p>}

        <div className="flex items-center gap-4">
          {user.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_BASE_URL}${user.avatar_url}`}
              alt="Avatar"
              className="h-16 w-16 rounded-full object-cover"
            />
          )}
          <div>
            <Label htmlFor="avatar-upload">Avatar</Label>
            <Input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatarChange} />
            <p className="mt-1 text-xs text-muted-foreground">
              Stored on local disk in this dev environment — swap for S3/MinIO before production.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input value={user.email} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Institution</Label>
            <Input value={organization.name} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Input value={roleName ?? user.role} disabled />
          </div>
        </div>
        <Button onClick={onSaveProfile} disabled={busy} className="w-fit">
          Save Profile
        </Button>

        {isAdmin && (
          <div className="mt-2 border-t border-border pt-4">
            <Label>Benchmark Symbol (Beta vs. benchmark comparison, admin only)</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                value={benchmarkSymbol}
                onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())}
                className="w-32"
              />
              <Button variant="outline" onClick={onSaveBenchmark} disabled={busy}>
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const { user, organization, setSession } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [enrollUri, setEnrollUri] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const [sessions, setSessions] = useState<SessionRead[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadSessions() {
    try {
      const resp = await listMySessions();
      setSessions(resp.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    }
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user || !organization) return null;

  async function onChangePassword() {
    setError(null);
    setPasswordMsg(null);
    setBusy(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordMsg("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  async function onEnroll() {
    setError(null);
    setBusy(true);
    try {
      const resp = await enrollMfa();
      setEnrollSecret(resp.secret);
      setEnrollUri(resp.provisioning_uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start MFA enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setError(null);
    setBusy(true);
    try {
      const resp = await verifyMfa(mfaCode);
      setSession(resp.user, resp.organization);
      setEnrollSecret(null);
      setEnrollUri(null);
      setMfaCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setError(null);
    setBusy(true);
    try {
      const resp = await disableMfa(mfaCode);
      setSession(resp.user, resp.organization);
      setMfaCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeSession(id: string) {
    try {
      const updated = await revokeMySession(id);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke session");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ErrorBanner message={error} />
          {passwordMsg && <p className="text-sm text-emerald-500">{passwordMsg}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Current password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
          </div>
          <Button onClick={onChangePassword} disabled={busy || !currentPassword || !newPassword} className="w-fit">
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>TOTP via an authenticator app (Google Authenticator, 1Password, etc.)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {user.mfa_enabled ? (
            <>
              <p className="flex items-center gap-2 text-sm text-emerald-500">
                <ShieldCheck className="h-4 w-4" /> MFA is enabled.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter code to disable"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-40"
                />
                <Button variant="destructive" onClick={onDisable} disabled={busy || mfaCode.length !== 6}>
                  <ShieldOff className="mr-2 h-4 w-4" /> Disable MFA
                </Button>
              </div>
            </>
          ) : enrollSecret ? (
            <>
              <p className="text-sm text-muted-foreground">
                Add this secret to your authenticator app, then enter the 6-digit code it generates.
              </p>
              <code className="w-fit rounded bg-muted px-2 py-1 text-sm">{enrollSecret}</code>
              <p className="break-all text-xs text-muted-foreground">{enrollUri}</p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="6-digit code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-32"
                />
                <Button onClick={onVerify} disabled={busy || mfaCode.length !== 6}>
                  Verify &amp; Enable
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={onEnroll} disabled={busy} className="w-fit">
              Enable MFA
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[240px] truncate text-xs">{s.device_info ?? "—"}</TableCell>
                  <TableCell>{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell>{new Date(s.expires_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {s.revoked_at ? <Badge variant="secondary">revoked</Badge> : <Badge variant="success">active</Badge>}
                  </TableCell>
                  <TableCell>
                    {!s.revoked_at && (
                      <Button variant="outline" size="sm" onClick={() => onRevokeSession(s.id)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyRead[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const resp = await listApiKeys();
      setKeys(resp.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleScope(scope: string) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      const resp = await createApiKey({
        name,
        scopes,
        expires_in_days: expiresInDays ? Number(expiresInDays) : null,
      });
      setRawKey(resp.raw_key);
      setName("");
      setScopes([]);
      setExpiresInDays("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      const updated = await revokeApiKey(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? updated : k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Create API Key</CardTitle>
          <CardDescription>Programmatic access to /strategies and /data.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ErrorBanner message={error} />
          {rawKey && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <code className="flex-1 truncate">{rawKey}</code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigator.clipboard.writeText(rawKey)}
                aria-label="Copy key"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {rawKey && (
            <p className="text-xs text-amber-500">
              Copy this key now — it will not be shown again.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CI pipeline key" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Expires in (days, optional)</Label>
              <Input
                type="number"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="90"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Scopes</Label>
            <div className="flex flex-wrap gap-3">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={scopes.includes(scope)} onCheckedChange={() => toggleScope(scope)} />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={onCreate} disabled={busy || !name} className="w-fit">
            Create Key
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                  <TableCell className="text-xs">{k.scopes.join(", ") || "—"}</TableCell>
                  <TableCell>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</TableCell>
                  <TableCell>{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "never"}</TableCell>
                  <TableCell>
                    {k.revoked_at ? (
                      <Badge variant="secondary">revoked</Badge>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => onRevoke(k.id)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const NOTIFICATION_TYPES: NotificationType[] = [
  "failure_detected",
  "evolution_completed",
  "approval_requested",
  "payment_failed",
];

function PreferencesTab() {
  const { user, organization, setSession } = useAuthStore();
  const [regimeFilter, setRegimeFilter] = useState(user?.preferences?.default_regime_filter ?? "");
  const [dateRangeDays, setDateRangeDays] = useState(String(user?.preferences?.default_date_range_days ?? 90));
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    user?.preferences?.notifications ?? {},
  );
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || !organization) return null;
  const currentOrganization = organization;

  async function onSave() {
    setError(null);
    setSavedMsg(null);
    setBusy(true);
    try {
      const updated = await updatePreferences({
        default_regime_filter: regimeFilter || null,
        default_date_range_days: Number(dateRangeDays) || null,
        notifications,
      });
      setSession(updated, currentOrganization);
      setSavedMsg("Preferences saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ErrorBanner message={error} />
        {savedMsg && <p className="text-sm text-emerald-500">{savedMsg}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Default regime filter (symbol)</Label>
            <Input value={regimeFilter} onChange={(e) => setRegimeFilter(e.target.value.toUpperCase())} placeholder="SPY" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Default date range (days)</Label>
            <Input type="number" value={dateRangeDays} onChange={(e) => setDateRangeDays(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Label>Notifications</Label>
          {NOTIFICATION_TYPES.map((type) => (
            <div key={type} className="flex items-center justify-between">
              <span className="text-sm">{NOTIFICATION_TYPE_LABELS[type]}</span>
              <Switch
                checked={notifications[type] ?? true}
                onCheckedChange={(checked) => setNotifications((prev) => ({ ...prev, [type]: checked }))}
              />
            </div>
          ))}
        </div>

        <Button onClick={onSave} disabled={busy} className="w-fit">
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  // Team management needs members.invite or roles.manage. Hiding the tab is a UX
  // affordance, not the control — the backend enforces both permissions itself.
  const isAdmin = useCanAny(PERM.MEMBERS_INVITE, PERM.ROLES_MANAGE);

  return (
    <DashboardShell>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>
        {isAdmin && (
          <TabsContent value="team">
            <TeamTab />
          </TabsContent>
        )}
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="usage">
          <UsageTab />
        </TabsContent>
        <TabsContent value="preferences">
          <div className="flex flex-col gap-6">
            <PreferencesTab />
            <DigestCard />
          </div>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
