import { useState, useEffect } from "react";
import { telegramAvatarUrl } from "../api";

const COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
  "bg-teal-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500",
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Props {
  id: string;
  title: string;
  size?: "sm" | "md" | "lg";
  hasAvatar?: boolean;
}

const sizes = { sm: "w-6 h-6 text-[10px]", md: "w-8 h-8 text-xs", lg: "w-10 h-10 text-sm" };

export default function Avatar({ id, title, size = "md", hasAvatar = true }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const letter = (title || "?")[0].toUpperCase();

  useEffect(() => {
    if (!hasAvatar) return;
    let cancelled = false;
    fetch(telegramAvatarUrl(id))
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((blob) => { if (!cancelled) setSrc(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id, hasAvatar]);

  const sizeClass = sizes[size];

  if (!src) {
    return (
      <div className={`${sizeClass} shrink-0 flex items-center justify-center text-white font-semibold ${hashColor(id)}`}>
        {letter}
      </div>
    );
  }

  return <img src={src} alt={title} className={`${sizeClass} shrink-0 object-cover`} />;
}
