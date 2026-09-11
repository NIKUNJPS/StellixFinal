"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { DemoForm } from "@/components/marketing/demo-form";

type DemoRequestModalProps = {
  className?: string;
  label?: string;
};

export function DemoRequestModal({
  className,
  label = "Request Demo",
}: DemoRequestModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>
        {label}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto border border-white/[0.1] bg-[#0D0D13] text-white shadow-[0_30px_120px_rgba(0,0,0,0.75)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-white">
            Request a demo
          </DialogTitle>

          <DialogDescription className="text-sm leading-relaxed text-white/55">
            Tell us about your firm and what you&apos;re trying to solve.
            Our team will get back to you within one business day.
          </DialogDescription>
        </DialogHeader>

        <DemoForm />
      </DialogContent>
    </Dialog>
  );
}