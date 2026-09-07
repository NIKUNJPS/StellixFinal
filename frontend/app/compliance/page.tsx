"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ComplianceRootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/compliance/governance");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-sm text-muted-foreground">Loading compliance dashboard…</p>
    </div>
  );
}
