"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Boxes,
  Building2,
  ChevronDown,
  Code2,
  Layers3,
  Mail,
  Menu,
  Network,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { LogoMark } from "@/components/marketing/logo";
import { buttonClass } from "@/components/marketing/site";
import { cn } from "@/lib/utils";

type DropdownItem = { label: string; description: string; href: string; icon: ElementType };
type NavItem = { label: string; href?: string; dropdown?: DropdownItem[] };

const NAVIGATION: NavItem[] = [
  {
    label: "Platform",
    dropdown: [
      { label: "Overview", description: "The four-layer system behind the research loop.", href: "/product", icon: Layers3 },
      { label: "Features", description: "Seven modules, each shown with a real artifact.", href: "/features", icon: Sparkles },
      { label: "Architecture", description: "Fail-closed tenancy, memory model, the locked stack.", href: "/architecture", icon: Boxes },
      { label: "Security", description: "Append-only records, audit trails, governed AI.", href: "/security", icon: ShieldCheck },
    ],
  },
  { label: "Use cases", href: "/use-cases" },
  {
    label: "Developers",
    dropdown: [
      { label: "Documentation", description: "Concepts, quickstart and guides.", href: "/docs", icon: BookOpen },
      { label: "API reference", description: "Generated live from the OpenAPI schema.", href: "/docs/api", icon: Code2 },
      { label: "Research Memory", description: "Six record types, eight relationships.", href: "/architecture#research-memory", icon: Network },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  {
    label: "Company",
    dropdown: [
      { label: "About", description: "Why we think failed research is the asset.", href: "/about", icon: Building2 },
      { label: "Contact", description: "Book a walkthrough with the team.", href: "/contact", icon: Mail },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.href) return pathname === item.href;
  return item.dropdown?.some((d) => !d.href.includes("#") && pathname === d.href) ?? false;
}

export function MarketingNav() {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpen(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-[80] w-full transition-[background-color,border-color,box-shadow] duration-300",
          scrolled || mobileOpen
            ? "border-b border-line bg-paper/85 shadow-[0_1px_0_rgba(14,18,32,0.02)] backdrop-blur-xl"
            : "border-b border-transparent bg-paper/90 backdrop-blur-xl",
        )}
      >
        <div className="mx-auto flex h-[72px] w-full max-w-[1240px] items-center justify-between gap-6 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Stellix Labs home">
            <LogoMark className="h-8 w-8" />
            <span className="flex flex-col leading-none">
              <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">Stellix Labs</span>
              <span className="mt-1 font-code text-[9px] uppercase tracking-[0.2em] text-ink-3">Research memory</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAVIGATION.map((item) => {
              const active = isActive(pathname, item);
              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                      active ? "bg-ink/[0.06] text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              }
              const isOpen = open === item.label;
              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => setOpen(item.label)}
                  onMouseLeave={() => setOpen(null)}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : item.label)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                      isOpen || active ? "bg-ink/[0.06] text-ink" : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
                    )}
                  >
                    {item.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute left-1/2 top-full w-[360px] -translate-x-1/2 pt-3"
                      >
                        <div className="rounded-2xl border border-line bg-paper-raised p-2 shadow-[0_24px_60px_-20px_rgba(14,18,32,0.28)]">
                          {item.dropdown!.map((d) => {
                            const Icon = d.icon;
                            return (
                              <Link
                                key={d.label}
                                href={d.href}
                                className="group flex items-start gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-paper"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-brand transition-colors group-hover:border-brand/30 group-hover:bg-brand-tint">
                                  <Icon className="h-[17px] w-[17px]" />
                                </span>
                                <span>
                                  <span className="block text-[14px] font-semibold text-ink">{d.label}</span>
                                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{d.description}</span>
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link href="/login" className={buttonClass("ghost", "sm", "h-10 px-4 text-[14px]")}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClass("ink", "sm", "h-10 px-5 text-[14px]")}>
              Get started
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper-raised text-ink lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-0 top-[72px] z-[70] overflow-y-auto bg-paper lg:hidden"
          >
            <nav className="mx-auto flex min-h-full max-w-xl flex-col px-5 py-6" aria-label="Mobile">
              {NAVIGATION.map((item) =>
                item.href ? (
                  <Link key={item.label} href={item.href} className="border-b border-line py-4 text-[20px] font-semibold text-ink">
                    {item.label}
                  </Link>
                ) : (
                  <div key={item.label} className="border-b border-line py-4">
                    <p className="font-code text-[11px] uppercase tracking-[0.18em] text-ink-3">{item.label}</p>
                    <div className="mt-3 grid gap-1">
                      {item.dropdown!.map((d) => (
                        <Link key={d.label} href={d.href} className="rounded-lg py-2 text-[17px] font-medium text-ink">
                          {d.label}
                          <span className="block text-[13px] font-normal text-ink-3">{d.description}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ),
              )}
              <div className="mt-auto grid gap-3 pt-8">
                <Link href="/register" className={buttonClass("primary", "lg")}>
                  Get started
                </Link>
                <Link href="/login" className={buttonClass("secondary", "lg")}>
                  Sign in
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
