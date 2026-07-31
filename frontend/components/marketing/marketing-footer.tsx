import Link from "next/link";

import { LogoMark } from "@/components/marketing/logo";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/product" },
      { label: "Features", href: "/features" },
      { label: "Architecture", href: "/architecture" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API Reference", href: "/docs#api-reference" },
      { label: "Knowledge Graph Schema", href: "/architecture#graph-schema" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Use Cases", href: "/use-cases" },
      { label: "Request a Demo", href: "/contact" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/docs#privacy" },
      { label: "Terms of Service", href: "/docs#terms" },
    ],
  },
];

/**
 * Footer (Cold Precision redesign): near-black #0A0F1E, minimal, explicit dark
 * palette — the scoped `.marketing` tokens are light, so this section styles
 * itself directly rather than through the tokens.
 */
export function MarketingFooter() {
  return (
    <footer className="bg-[#0A0F1E]">
      <div className="container py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8" />
              <span className="font-display text-lg tracking-tight text-white">Stellix Labs</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF]">
              Regime-conditioned. Failure-aware. Compounding over time.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/80">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#9CA3AF] transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-[#9CA3AF] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Stellix Labs. The institutional memory layer for quantitative research.</p>
          <p>
            Built in India <span aria-hidden>🇮🇳</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
