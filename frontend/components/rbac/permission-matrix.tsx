"use client";

import { memo, useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { groupByCategory, type Permission } from "@/lib/rbac";

/** Batch 26: permission checkboxes grouped by catalog category. Shared by the org
 * custom-role editor and the SuperAdmin system-role console. */
export const PermissionMatrix = memo(function PermissionMatrix({
  catalog,
  selected,
  onChange,
  disabled = false,
  testId,
}: {
  catalog: Permission[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const groups = useMemo(() => groupByCategory(catalog), [catalog]);

  function toggle(key: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    onChange(next);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid={testId}>
      {groups.map(([category, perms]) => (
        <fieldset key={category} className="rounded-xl border border-white/[0.08] p-3">
          <legend className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
            {category}
          </legend>
          <div className="flex flex-col gap-2">
            {perms.map((p) => (
              <label key={p.key} className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  checked={selected.has(p.key)}
                  disabled={disabled}
                  onCheckedChange={(v) => toggle(p.key, v === true)}
                  aria-label={p.key}
                  data-permission={p.key}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-[#F5F5F7]">{p.key}</span>
                  <span className="block text-[11px] text-[#808495]">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
});
