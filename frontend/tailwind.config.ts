import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        // Public site (light theme) — see app/fonts.ts
        editorial: ["var(--font-manrope)", "system-ui", "sans-serif"],
        ui: ["var(--font-site-sans)", "system-ui", "sans-serif"],
        code: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "flow-dash": {
          to: { strokeDashoffset: "-24" },
        },
        "pulse-node": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "reveal-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Batch 18: typing caret on the streaming assistant response.
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        // Public site: the regime tape scrolls continuously.
        "tape-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        // Live hero colour grade
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(-40px,30px,0) scale(1.08)" },
          "66%": { transform: "translate3d(30px,-20px,0) scale(0.96)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "grow-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        scan: {
          from: { transform: "translateY(-100%)", opacity: "1" },
          to: { transform: "translateY(900%)", opacity: "0" },
        },
        sheen: {
          "0%, 60%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
      },
      animation: {
        "flow-dash": "flow-dash 1.1s linear infinite",
        "pulse-node": "pulse-node 3s ease-in-out infinite",
        blink: "blink 1s step-end infinite",
        "tape-scroll": "tape-scroll 60s linear infinite",
        aurora: "aurora 18s ease-in-out infinite",
        "aurora-slow": "aurora 26s ease-in-out infinite reverse",
        "gradient-x": "gradient-x 6s ease-in-out infinite",
        sheen: "sheen 4.5s ease-in-out infinite",
        "rise-in": "rise-in 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "grow-x": "grow-x 0.7s cubic-bezier(0.16,1,0.3,1) both",
        scan: "scan 1.1s ease-in-out both",
      },
      colors: {
        // shadcn/ui tokens (driven by CSS variables in globals.css)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Locked Stellix brand palette (PROJECT_CONSTITUTION / Batch 0).
        stellix: {
          primary: "var(--stellix-primary)",
          accent: "var(--stellix-accent)",
          highlight: "var(--stellix-highlight)",
        },
        // Public-site "paper & ink" palette (marketing + auth only). Every text
        // pairing is WCAG AA or better on paper: ink 17.6:1, ink-2 9.2:1,
        // ink-3 5.4:1, brand 6.7:1 (7.2:1 on white), signal-text 5.9:1,
        // loss 5.1:1, gain 5.0:1. White on brand is 7.2:1.
        paper: {
          DEFAULT: "#F8F7F4",
          raised: "#FFFFFF",
          sunken: "#F1EFEA",
        },
        ink: {
          DEFAULT: "#0E1220",
          2: "#3D4356",
          3: "#5E6679",
          night: "#0B0E1A",
          panel: "#141A2B",
        },
        line: {
          DEFAULT: "#E4E1D9",
          strong: "#CFCBC0",
        },
        brand: {
          DEFAULT: "#4B3FD1",
          hover: "#3A2FB8",
          tint: "#EFEDFF",
          soft: "#DAD5FF",
          bright: "#A79CFF",
        },
        signal: {
          DEFAULT: "#F4B740",
          text: "#8A5300",
          tint: "#FDF3DC",
        },
        loss: { DEFAULT: "#C2362B", tint: "#FCEAE7" },
        gain: { DEFAULT: "#0F7A4A", tint: "#E3F4EA" },
        regime: {
          bull: "#1E9E63",
          bear: "#D9483B",
          hvol: "#E59A1A",
          lvol: "#2F86D6",
          side: "#8B7FD6",
          crisis: "#8F1D3A",
        },
        // Batch 24: crimson is the SUPERADMIN console accent only — deliberately
        // outside the client brand palette so the founder's platform-wide surface
        // is unmistakable at a glance and never confused with a tenant's view.
        crimson: {
          DEFAULT: "#dc2626",
          bright: "#ef4444",
          dark: "#991b1b",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
