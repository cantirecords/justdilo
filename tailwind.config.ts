import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1100px" } },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        accent: "hsl(var(--accent))",
      },
      borderRadius: { lg: "1rem", md: "0.75rem", sm: "0.5rem" },
      keyframes: {
        pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".6" } },
        rise: { "0%": { transform: "translateY(18px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
      },
      animation: {
        rise: "rise 0.45s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
