import { useState, useEffect, useRef, useCallback } from "react";
import { mediaUrl } from "../api";
import Icon from "./Icon";

interface MediaFile {
  id: number;
  type: string;
  fileName: string | null;
}

interface Props {
  files: MediaFile[];
  initialIndex?: number;
  onClose: () => void;
}

export default function MediaGallery({ files, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const [swiping, setSwiping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = files[index];
  const total = files.length;

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const next = useCallback(() => setIndex((i) => (i < total - 1 ? i + 1 : i)), [total]);

  // Keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, prev, next]);

  // Touch swipe
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setSwiping(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }

  function handleTouchEnd() {
    setSwiping(false);
    if (touchDeltaX.current > 60) prev();
    else if (touchDeltaX.current < -60) next();
    touchDeltaX.current = 0;
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === containerRef.current) onClose();
  }

  return (
    <div
      ref={containerRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-fadeIn"
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
        <span className="text-white/70 text-sm font-medium tabular-nums">
          {total > 1 ? `${index + 1} / ${total}` : ""}
        </span>
        <button onClick={onClose} className="p-1 text-white/70 hover:text-white transition-colors">
          <Icon name="close" size={24} />
        </button>
      </div>

      {/* Nav arrows — desktop only */}
      {total > 1 && index > 0 && (
        <button onClick={prev}
          className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors">
          <Icon name="chevron_left" size={28} />
        </button>
      )}
      {total > 1 && index < total - 1 && (
        <button onClick={next}
          className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors">
          <Icon name="chevron_right" size={28} />
        </button>
      )}

      {/* Content */}
      <div className="w-full h-full flex items-center justify-center p-4 sm:p-12 pt-14">
        {current.type === "photo" ? (
          <img
            key={current.id}
            src={mediaUrl(current.id)}
            alt={current.fileName || ""}
            className="max-w-full max-h-full object-contain select-none animate-fadeIn"
            draggable={false}
          />
        ) : current.type === "video" || current.type === "animation" ? (
          <video
            key={current.id}
            src={mediaUrl(current.id)}
            controls
            autoPlay
            className="max-w-full max-h-full object-contain animate-fadeIn"
          />
        ) : (
          <div className="text-center text-white/60 animate-fadeIn">
            <Icon name="description" size={48} />
            <p className="mt-2 text-sm">{current.fileName || "file"}</p>
            <a href={mediaUrl(current.id)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">
              <Icon name="download" size={16} /> Завантажити
            </a>
          </div>
        )}
      </div>

      {/* Dots — mobile, if multiple */}
      {total > 1 && total <= 10 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 sm:hidden">
          {files.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 transition-colors ${i === index ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
