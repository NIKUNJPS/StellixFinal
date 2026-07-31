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
      },
      animation: {
        "flow-dash": "flow-dash 1.1s linear infinite",
        "pulse-node": "pulse-node 3s ease-in-out infinite",
        blink: "blink 1s step-end infinite",
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
