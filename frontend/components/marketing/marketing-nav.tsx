"use client";

/**
 * Marketing nav (Cold Precision redesign). Sticky white bar with a thin bottom
 * border; past 50px of scroll it gains a subtle shadow. Desktop: centered links,
 * "Log in" text + filled Request Demo button (36px). Mobile: hamburger opening a
 * full-screen white overlay whose links slide in from the right, 0.05s stagger.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Menu, X } from "lucide-react";

import { LogoMark } from "@/components/marketing/logo";
import { NAV_LINKS } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

// Module-level variants (perf rule: never recreated in render).
const OVERLAY: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

const LINKS_WRAP: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const LINK_ITEM: Variants = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
};

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const authed = mounted && isAuthenticated;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-[#E2E8F0] bg-white transition-shadow duration-300",
        scrolled && "shadow-[0_2px_16px_rgba(10,15,30,0.06)]",
      )}
    >
      <nav className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Stellix Labs home">
          <LogoMark className="h-8 w-8" />
          <span className="font-display text-lg tracking-tight text-[#0A0F1E]">Stellix Labs</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-[#64748B] transition-colors hover:text-[#0A0F1E]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-5 lg:flex">
          <Link
            href={authed ? "/dashboard" : "/login"}
            className="text-sm text-[#64748B] transition-colors hover:text-[#0A0F1E]"
          >
            {authed ? "Dashboard" : "Log in"}
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-9 items-center rounded-md bg-[#0066FF] px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#003399]"
          >
            Request Demo
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#0A0F1E] lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile full-screen overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 top-16 z-40 flex flex-col bg-white lg:hidden"
            variants={reduced ? undefined : OVERLAY}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="container flex flex-1 flex-col gap-1 overflow-y-auto py-8"
              variants={reduced ? undefined : LINKS_WRAP}
              initial="hidden"
              animate="visible"
            >
              {NAV_LINKS.map((link) => (
                <motion.div key={link.href} variants={reduced ? undefined : LINK_ITEM}>
                  <Link
                    href={link.href}
                    className="font-display block rounded-md px-3 py-3.5 text-2xl text-[#0A0F1E] hover:text-[#0066FF]"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                variants={reduced ? undefined : LINK_ITEM}
                className="mt-8 flex flex-col gap-3"
              >
                <Link
                  href={authed ? "/dashboard" : "/login"}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-[#E2E8F0] text-sm font-medium text-[#0A0F1E]"
                  onClick={() => setOpen(false)}
                >
                  {authed ? "Dashboard" : "Log in"}
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-[#0066FF] text-sm font-medium text-white"
                  onClick={() => setOpen(false)}
                >
                  Request Demo
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
