import { Inter, JetBrains_Mono, Manrope } from "next/font/google";

/**
 * Public-site typography (light "paper & ink" theme). Shared by the marketing
 * layout and the auth screens so sign-in/sign-up read as the same product as
 * the landing page. The dashboard keeps its own Inter/Fraunces stack.
 *
 *  - Manrope 600–700  → headings (`font-editorial`)
 *  - Inter 400–450    → UI + body copy (`font-ui`)
 *  - JetBrains Mono   → real code / schema artifacts and meta labels (`font-code`)
 */
export const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const interSite = Inter({
  subsets: ["latin"],
  variable: "--font-site-sans",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

/** Class string that exposes all three font variables. */
export const siteFontClasses = `${manrope.variable} ${interSite.variable} ${jetbrainsMono.variable}`;
