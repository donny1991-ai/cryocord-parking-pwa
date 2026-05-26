import type { Config } from "tailwindcss";

/**
 * CryoCord brand tokens are the single source of truth for colour.
 *   Primary red  #C8102E   Hover red #CC0000   Background #F2F2F2
 * Glassmorphism + motion live in globals.css; this config exposes the palette,
 * radii, shadows and animations those rely on.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#C8102E",
          red: "#C8102E",
          hover: "#CC0000",
          dark: "#8E0B20",
          tint: "#FBE9EC",
        },
        canvas: "#F2F2F2",
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#4A4A4A",
          faint: "#7A7A7A",
        },
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        glass: "0 12px 32px -14px rgba(20,22,60,0.24)",
        "glass-red": "0 20px 48px -18px rgba(200,16,46,0.55)",
        "glass-inset": "inset 0 1px 0 rgba(255,255,255,0.8)",
        lift: "0 4px 14px rgba(0,0,0,0.08)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        enter: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "60%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "70%": { transform: "scale(2)", opacity: "0" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        enter: "enter 0.45s cubic-bezier(0.22,1,0.36,1) both",
        pop: "pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
        shimmer: "shimmer 1.8s linear infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
