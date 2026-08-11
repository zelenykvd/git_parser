/** @type {import('tailwindcss').Config} */

// Every colour is a CSS custom property holding "R G B" channels (see src/index.css),
// so the same utility class (bg-card, text-muted, …) resolves to the light or dark
// palette automatically — no `dark:` duplication across the components.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        bg: token("bg"),
        "bg-2": token("bg-2"),
        card: token("card"),
        elev: token("elev"),
        line: token("line"),
        "line-2": token("line-2"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        muted: token("muted"),
        faint: token("faint"),
        brand: token("brand"),
        "brand-2": token("brand-2"),
        "brand-3": token("brand-3"),
        "brand-ink": token("brand-ink"),
        "brand-soft": token("brand-soft"),
        success: token("success"),
        "success-soft": token("success-soft"),
        danger: token("danger"),
        "danger-soft": token("danger-soft"),
        warn: token("warn"),
        "warn-soft": token("warn-soft"),
        info: token("info"),
        "info-soft": token("info-soft"),
        violet: token("violet"),
        "violet-soft": token("violet-soft"),
      },
      borderRadius: {
        card: "16px",
        bubble: "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--c-shadow) / 0.06), 0 1px 3px rgb(var(--c-shadow) / 0.04)",
        lift: "0 6px 16px -4px rgb(var(--c-shadow) / 0.14), 0 2px 6px -2px rgb(var(--c-shadow) / 0.08)",
        pop: "0 12px 32px -8px rgb(var(--c-shadow) / 0.22), 0 4px 10px -4px rgb(var(--c-shadow) / 0.12)",
        brand: "0 6px 18px -6px rgb(var(--c-brand) / 0.55)",
      },
      transitionTimingFunction: {
        // Telegram's easing — quick out, soft settle.
        tg: "cubic-bezier(0.25, 0.8, 0.25, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        routeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", maxHeight: "0" },
          "100%": { opacity: "1", maxHeight: "2000px" },
        },
        dropIn: {
          "0%": { opacity: "0", transform: "translateY(-6px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.82)" },
          "60%": { opacity: "1", transform: "scale(1.06)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        checkPop: {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "50%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        zoomIn: {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        spin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        barber: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "28px 0" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "70%": { transform: "scale(2.2)", opacity: "0" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(0, -18px, 0) scale(1.06)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 200ms ease-out",
        fadeInUp: "fadeInUp 320ms cubic-bezier(0.25, 0.8, 0.25, 1) both",
        routeIn: "routeIn 260ms cubic-bezier(0.25, 0.8, 0.25, 1) both",
        slideDown: "slideDown 300ms ease-out forwards",
        dropIn: "dropIn 160ms cubic-bezier(0.25, 0.8, 0.25, 1) both",
        popIn: "popIn 260ms cubic-bezier(0.25, 0.8, 0.25, 1) both",
        checkPop: "checkPop 250ms ease-out",
        zoomIn: "zoomIn 220ms cubic-bezier(0.25, 0.8, 0.25, 1) both",
        slideUp: "slideUp 280ms cubic-bezier(0.25, 0.8, 0.25, 1) both",
        shimmer: "shimmer 1.6s infinite linear",
        spin: "spin 0.8s linear infinite",
        barber: "barber 700ms linear infinite",
        pulseRing: "pulseRing 2s cubic-bezier(0.25, 0.8, 0.25, 1) infinite",
        floatSlow: "floatSlow 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
