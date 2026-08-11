import { useState, useEffect } from "react";
import { telegramAvatarUrl } from "../api";

// Telegram-style avatar gradients for the letter fallback.
const COLORS = [
  "from-rose-400 to-rose-600",
  "from-orange-400 to-amber-600",
  "from-amber-400 to-yellow-600",
  "from-emerald-400 to-emerald-600",
  "from-teal-400 to-cyan-600",
  "from-sky-400 to-blue-600",
  "from-indigo-400 to-indigo-600",
  "from-violet-400 to-purple-600",
  "from-pink-400 to-fuchsia-600",
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

const sizes = { sm: "w-6 h-6 text-[10px]", md: "w-8 h-8 text-xs", lg: "w-11 h-11 text-base" };

// The same channel shows up on many cards at once, so resolve each id once per
// session: object URLs are shared, and ids without an avatar are never re-asked
// (a miss can cost the backend a Telegram API round-trip).
const resolved = new Map<string, Promise<string | null>>();

function loadAvatar(id: string): Promise<string | null> {
  let pending = resolved.get(id);
  if (!pending) {
    pending = fetch(telegramAvatarUrl(id))
      .then((r) => { if (!r.ok) throw new Error("no avatar"); return r.blob(); })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => null);
    resolved.set(id, pending);
  }
  return pending;
}

export default function Avatar({ id, title, size = "md", hasAvatar = true }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const letter = (title || "?")[0].toUpperCase();

  useEffect(() => {
    if (!hasAvatar) return;
    let cancelled = false;
    loadAvatar(id).then((url) => { if (!cancelled && url) setSrc(url); });
    return () => { cancelled = true; };
  }, [id, hasAvatar]);

  const sizeClass = sizes[size];

  if (!src) {
    return (
      <div
        className={`${sizeClass} shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br ${hashColor(id)} text-white font-semibold select-none`}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className={`${sizeClass} shrink-0 rounded-full object-cover bg-elev animate-fadeIn`}
    />
  );
}
