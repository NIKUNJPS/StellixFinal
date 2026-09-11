import Link from "next/link";

import { LogoMark } from "@/components/marketing/logo";

const COLUMNS: {
  title: string;
  links: { label: string; href: string }[];
}[] = [
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
      {
        label: "Knowledge Graph Schema",
        href: "/architecture#graph-schema",
      },
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

export function MarketingFooter() {
  return (
    <footer className="relative bg-[#050506]">
      {/* subtle top separator */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />

      <div className="mx-auto w-full max-w-[1800px] px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
        {/* Main footer */}
        <div className="grid gap-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-10">
          {/* Brand */}
          <div className="max-w-xs">
            <Link
              href="/"
              className="inline-flex items-center gap-3"
            >
              <LogoMark className="h-8 w-8" />

              <span className="text-[18px] font-semibold tracking-[-0.03em] text-white">
                Stellix Labs
              </span>
            </Link>

            <p className="mt-5 text-[14px] leading-relaxed text-white/40">
              Research infrastructure for preserving failure intelligence,
              understanding market regimes, and compounding institutional
              knowledge.
            </p>
          </div>

          {/* Links */}
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                {column.title}
              </p>

              <ul className="mt-6 space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-white/35 transition-colors duration-200 hover:text-[#A79CFF]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-16 flex flex-col gap-5 border-t border-white/[0.07] pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-white/25">
            © 2026 Stellix Labs. All rights reserved.
          </p>

          <p className="text-[12px] text-white/25">
            The institutional memory layer for quantitative research.
          </p>
        </div>
      </div>
    </footer>
  );
}