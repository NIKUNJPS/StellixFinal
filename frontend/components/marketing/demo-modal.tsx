"use client";

import { useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DemoForm } from "@/components/marketing/demo-form";

/**
 * Landing-page "Request Demo" MODAL (Batch 24).
 *
 * The public demo request already had a full page at /contact (Batch 15). This adds
 * the on-page modal the batch calls for so a visitor can request a demo without
 * leaving the landing page — it reuses the SAME <DemoForm /> (which POSTs the public
 * /contact/demo-request endpoint), so there is exactly one form implementation and one
 * validation schema, not a divergent copy. /contact stays as the deep-link fallback.
 */
export function DemoRequestModal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request a demo</DialogTitle>
          <DialogDescription>
            Tell us about your firm and what you&apos;re trying to solve. A real person
            reaches out within one business day.
          </DialogDescription>
        </DialogHeader>
        <DemoForm />
      </DialogContent>
    </Dialog>
  );
}
