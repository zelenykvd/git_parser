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
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    // Don't capture swipe on video controls
    if ((e.target as HTMLElement).tagName === "VIDEO") return;
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if ((e.target as HTMLElement).tagName === "VIDEO") return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }

  function handleTouchEnd() {
    if (touchDeltaX.current > 60) prev();
    else if (touchDeltaX.current < -60) next();
    touchDeltaX.current = 0;
  }

  function handleBackdropClick(e: React.MouseEvent) {
    const tag = (e.target as HTMLElement).tagName;
    // Don't close on video/img click
    if (tag === "VIDEO" || tag === "IMG") return;
    if (e.target === containerRef.current) onClose();
  }

  const url = mediaUrl(current.id);
  const isVideo = current.type === "video" || current.type === "animation";
  const isPhoto = current.type === "photo";

  const navBtn =
    "press hidden sm:flex absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md text-white ring-1 ring-white/15";

  return (
    <div
      ref={containerRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-fadeIn"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white/70 text-sm font-medium tabular-nums">
          {total > 1 ? `${index + 1} / ${total}` : ""}
        </span>
        <button onClick={onClose}
          className="press flex items-center justify-center w-9 h-9 rounded-full text-white/70 hover:text-white hover:bg-white/10">
          <Icon name="close" size={24} />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-2 pb-4 sm:px-14">
        {/* Nav arrows — desktop */}
        {total > 1 && index > 0 && (
          <button onClick={prev} className={`${navBtn} left-3`}>
            <Icon name="chevron_left" size={28} />
          </button>
        )}
        {total > 1 && index < total - 1 && (
          <button onClick={next} className={`${navBtn} right-3`}>
            <Icon name="chevron_right" size={28} />
          </button>
        )}

        {isPhoto && (
          <img
            key={current.id}
            src={url}
            alt={current.fileName || ""}
            className="max-w-full max-h-full object-contain select-none rounded-xl shadow-pop animate-zoomIn"
            draggable={false}
          />
        )}

        {isVideo && (
          <video
            ref={videoRef}
            key={current.id}
            src={url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full rounded-xl bg-black animate-zoomIn"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          />
        )}

        {!isPhoto && !isVideo && (
          <div className="text-center text-white/60 animate-zoomIn">
            <Icon name="description" size={48} />
            <p className="mt-2 text-sm">{current.fileName || "file"}</p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="press inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-sm ring-1 ring-white/15">
              <Icon name="download" size={16} /> Завантажити
            </a>
          </div>
        )}
      </div>

      {/* Dots — mobile */}
      {total > 1 && total <= 10 && (
        <div className="flex justify-center gap-1.5 pb-5 shrink-0 sm:hidden">
          {files.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ease-tg ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
