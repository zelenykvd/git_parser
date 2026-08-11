import { useEffect, useState } from "react";
import Icon from "./Icon";
import { getTheme, setTheme, applyTheme, Theme } from "../theme";

const ORDER: Theme[] = ["system", "light", "dark"];
const META: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "brightness_auto", label: "Тема: як у системі" },
  light: { icon: "light_mode", label: "Тема: світла" },
  dark: { icon: "dark_mode", label: "Тема: темна" },
};

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  // Keep <html> in sync (also covers the very first render).
  useEffect(() => { applyTheme(theme); }, [theme]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    setThemeState(next);
  }

  const meta = META[theme];

  return (
    <button
      onClick={cycle}
      title={meta.label}
      aria-label={meta.label}
      className={`press flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-ink hover:bg-elev ${className}`}
    >
      {/* keyed so the glyph pops on every change */}
      <Icon key={theme} name={meta.icon} size={20} className="animate-popIn" />
    </button>
  );
}
