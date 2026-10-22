import Link from "next/link";

import { RegimeTape } from "@/components/marketing/artifacts";
import { LogoMark } from "@/components/marketing/logo";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Overview", href: "/product" },
      { label: "Features", href: "/features" },
      { label: "Architecture", href: "/architecture" },
      { label: "Security", href: "/security" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API reference", href: "/docs/api" },
      { label: "Research Memory", href: "/architecture#research-memory" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Request a demo", href: "/contact" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create a workspace", href: "/register" },
      { label: "Reset password", href: "/forgot-password" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-paper-sunken">
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <LogoMark className="h-8 w-8" />
              <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">Stellix Labs</span>
            </Link>
            <p className="mt-5 text-[14px] leading-relaxed text-ink-2">
              The institutional memory layer for quantitative research. Regime-conditioned, failure-aware, and
              compounding with every strategy you test.
            </p>
            <RegimeTape className="mt-6 h-2 max-w-[260px]" />
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-code text-[11px] font-medium uppercase tracking-[0.18em] text-ink-3">{col.title}</p>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[14px] text-ink-2 transition-colors hover:text-brand">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-line pt-7 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Stellix Labs. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/docs#privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/docs#terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/security" className="hover:text-ink">
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
