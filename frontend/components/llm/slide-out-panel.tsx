"use client";

import type { ReactNode } from "react";

interface SlideOutPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function SlideOutPanel({ open, onClose, title, children }: SlideOutPanelProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="llm-slide-out-panel">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onClose}
            data-testid="llm-panel-close"
          >
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
