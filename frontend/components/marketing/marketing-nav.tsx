"use client";

import Link from "next/link";
import { useState, type ElementType } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  BrainCircuit,
  Building2,
  ChevronDown,
  Code2,
  FileText,
  Layers3,
  Menu,
  Network,
  X,
} from "lucide-react";

import { LogoMark } from "@/components/marketing/logo";
import { DemoRequestModal } from "@/components/marketing/demo-modal";

type DropdownItem = {
  label: string;
  description: string;
  href: string;
  icon: ElementType;
};

type NavItem = {
  label: string;
  href?: string;
  dropdown?: DropdownItem[];
};

const NAVIGATION: NavItem[] = [
  {
    label: "Product",
    dropdown: [
      {
        label: "Overview",
        description:
          "Explore the Stellix research intelligence platform.",
        href: "/product",
        icon: Layers3,
      },
      {
        label: "Features",
        description:
          "Regime intelligence, failure preservation, and institutional memory.",
        href: "/features",
        icon: BrainCircuit,
      },
      {
        label: "Architecture",
        description:
          "Understand the infrastructure behind Stellix intelligence.",
        href: "/architecture",
        icon: Network,
      },
    ],
  },

  {
    label: "Developers",
    dropdown: [
      {
        label: "Documentation",
        description:
          "Guides and resources for working with the Stellix platform.",
        href: "/docs",
        icon: FileText,
      },
      {
        label: "API Reference",
        description:
          "Explore APIs, integrations, and platform capabilities.",
        href: "/docs#api-reference",
        icon: Code2,
      },
      {
        label: "Knowledge Graph",
        description:
          "Explore the institutional intelligence graph schema.",
        href: "/architecture#graph-schema",
        icon: Network,
      },
    ],
  },

  {
    label: "Use Cases",
    href: "/use-cases",
  },

  {
    label: "Company",
    dropdown: [
      {
        label: "About Stellix",
        description:
          "Learn about our vision for institutional research intelligence.",
        href: "/pricing",
        icon: Building2,
      },
      {
        label: "Contact",
        description:
          "Talk directly with the Stellix Labs team.",
        href: "/contact",
        icon: FileText,
      },
    ],
  },
];

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(
    null
  );

  return (
    <>
      {/* ================= NAVBAR ================= */}

      <header className="sticky top-0 z-[80] w-full border-b border-white/[0.08] bg-[#050506]">
        {/* subtle purple atmosphere */}

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[15%] top-[-160px] h-[300px] w-[500px] rounded-full bg-[#522A6F]/15 blur-[120px]" />

          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#8B7CFF]/25 to-transparent" />
        </div>

        <div className="relative mx-auto flex h-[94px] w-full max-w-[1800px] items-center justify-between px-7 sm:px-10 lg:px-16 xl:px-20">
          {/* ================= LOGO ================= */}

          <Link
            href="/"
            onClick={() => {
              setMobileOpen(false);
              setActiveDropdown(null);
            }}
            className="relative z-[90] flex items-center gap-4"
          >
            <LogoMark className="h-10 w-10" />

            <div className="flex flex-col">
              <span className="text-[21px] font-semibold leading-none tracking-[-0.035em] text-white">
                Stellix Labs
              </span>

              <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.24em] text-white/30">
                Research Infrastructure
              </span>
            </div>
          </Link>

          {/* ================= DESKTOP NAV ================= */}

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 lg:flex">
            {NAVIGATION.map((item) => {
              const hasDropdown = Boolean(item.dropdown);
              const isOpen = activeDropdown === item.label;

              if (!hasDropdown) {
                return (
                  <Link
                    key={item.label}
                    href={item.href!}
                    className="rounded-xl px-5 py-3 text-[15px] font-medium text-white/55 transition-all duration-200 hover:bg-white/[0.035] hover:text-white"
                  >
                    {item.label}
                  </Link>
                );
              }

              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() =>
                    setActiveDropdown(item.label)
                  }
                  onMouseLeave={() =>
                    setActiveDropdown(null)
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDropdown(
                        isOpen ? null : item.label
                      )
                    }
                    className={`flex items-center gap-2 rounded-xl px-5 py-3 text-[15px] font-medium transition-all duration-200 ${
                      isOpen
                        ? "bg-white/[0.045] text-white"
                        : "text-white/55 hover:bg-white/[0.035] hover:text-white"
                    }`}
                  >
                    {item.label}

                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{
                          opacity: 0,
                          y: 10,
                          scale: 0.98,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                        }}
                        exit={{
                          opacity: 0,
                          y: 10,
                          scale: 0.98,
                        }}
                        transition={{
                          duration: 0.18,
                          ease: "easeOut",
                        }}
                        className="absolute left-1/2 top-full mt-4 w-[390px] -translate-x-1/2 overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#0B0B10] p-2.5 shadow-[0_35px_100px_rgba(0,0,0,0.8)]"
                      >
                        {/* Purple top accent */}

                        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#8B7CFF] to-transparent" />

                        {/* Dropdown header */}

                        <div className="px-4 pb-3 pt-3">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#A79CFF]/70">
                            Explore Stellix
                          </p>
                        </div>

                        <div className="space-y-1">
                          {item.dropdown!.map(
                            (dropdownItem) => {
                              const Icon = dropdownItem.icon;

                              return (
                                <Link
                                  key={dropdownItem.label}
                                  href={dropdownItem.href}
                                  onClick={() =>
                                    setActiveDropdown(null)
                                  }
                                  className="group flex items-start gap-4 rounded-[16px] px-4 py-4 transition-all duration-200 hover:bg-white/[0.055]"
                                >
                                  {/* Icon */}

                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#8B7CFF]/20 bg-[#8B7CFF]/[0.08] transition-all duration-200 group-hover:border-[#A79CFF]/40 group-hover:bg-[#8B7CFF]/[0.14] group-hover:shadow-[0_0_25px_rgba(139,124,255,0.12)]">
                                    <Icon className="h-[18px] w-[18px] text-[#A79CFF]" />
                                  </div>

                                  {/* Text */}

                                  <div className="min-w-0 flex-1 pt-0.5">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-[15px] font-medium text-white transition-colors duration-200 group-hover:text-[#C0B8FF]">
                                        {dropdownItem.label}
                                      </span>

                                      <ArrowUpRight className="h-4 w-4 shrink-0 text-white/35 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#A79CFF]" />
                                    </div>

                                    <p className="mt-1.5 text-[12px] leading-relaxed text-white/60 transition-colors duration-200 group-hover:text-white/75">
                                      {dropdownItem.description}
                                    </p>
                                  </div>
                                </Link>
                              );
                            }
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          {/* ================= DESKTOP ACTIONS ================= */}

          <div className="relative z-[90] hidden items-center gap-5 lg:flex">
            <Link
              href="/login"
              className="rounded-xl px-4 py-3 text-[15px] font-medium text-white/60 transition-all duration-200 hover:bg-white/[0.035] hover:text-white"
            >
              Login
            </Link>

            <DemoRequestModal
  className="rounded-xl bg-[#8B7CFF] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(82,42,111,0.3)] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#A79CFF] hover:shadow-[0_12px_40px_rgba(139,124,255,0.3)]"
/>
          </div>

          {/* ================= MOBILE BUTTON ================= */}

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="relative z-[90] flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-white transition-colors hover:bg-white/[0.07] lg:hidden"
            aria-label="Toggle navigation"
          >
            <AnimatePresence mode="wait">
              {mobileOpen ? (
                <motion.div
                  key="close"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                >
                  <X className="h-6 w-6" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -90 }}
                >
                  <Menu className="h-6 w-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </header>

      {/* ================= MOBILE NAV ================= */}

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-[#050506] pt-[94px] lg:hidden"
          >
            {/* Background */}

            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-[-30%] top-[10%] h-[500px] w-[500px] rounded-full bg-[#522A6F]/15 blur-[150px]" />
            </div>

            <motion.nav
              initial={{
                y: -20,
                opacity: 0,
              }}
              animate={{
                y: 0,
                opacity: 1,
              }}
              exit={{
                y: -20,
                opacity: 0,
              }}
              transition={{
                duration: 0.25,
              }}
              className="relative mx-auto flex h-[calc(100vh-94px)] max-w-xl flex-col overflow-y-auto px-7 py-8"
            >
              {/* Navigation */}

              <div className="space-y-1">
                {NAVIGATION.map((item) => (
                  <div key={item.label}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={() =>
                          setMobileOpen(false)
                        }
                        className="flex border-b border-white/[0.08] py-5 text-[23px] font-medium tracking-[-0.035em] text-white transition-colors hover:text-[#A79CFF]"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <div className="border-b border-white/[0.08] py-5">
                        <p className="text-[23px] font-medium tracking-[-0.035em] text-white">
                          {item.label}
                        </p>

                        <div className="mt-5 space-y-4 pl-1">
                          {item.dropdown?.map(
                            (subItem) => (
                              <Link
                                key={subItem.label}
                                href={subItem.href}
                                onClick={() =>
                                  setMobileOpen(false)
                                }
                                className="block"
                              >
                                <span className="block text-[15px] font-medium text-white/75 transition-colors hover:text-[#A79CFF]">
                                  {subItem.label}
                                </span>

                                <span className="mt-1 block text-[12px] leading-relaxed text-white/45">
                                  {subItem.description}
                                </span>
                              </Link>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}

              <div className="mt-auto space-y-4 py-8">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center rounded-xl border border-white/[0.12] py-4 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/[0.05]"
                >
                  Login
                </Link>

<DemoRequestModal
  className="flex w-full items-center justify-center rounded-xl bg-[#8B7CFF] py-4 text-[15px] font-semibold text-white shadow-[0_10px_35px_rgba(82,42,111,0.35)] transition-all hover:bg-[#A79CFF]"
/>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}