/**
 * Theme preference: "system" (follow prefers-color-scheme), "light" or "dark".
 * The choice is written to <html data-theme> — src/index.css keys the palette
 * off that attribute, falling back to the OS preference when it is absent.
 */
export type Theme = "system" | "light" | "dark";

const KEY = "admin_theme";

export function getTheme(): Theme {
  const raw = localStorage.getItem(KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
  if (theme === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

/** True when the given preference currently renders as dark. */
export function isDark(theme: Theme): boolean {
  if (theme !== "system") return theme === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
