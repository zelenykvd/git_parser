import { useState } from "react";
import { mediaUrl } from "../api";
import Icon from "./Icon";
import MediaGallery from "./MediaGallery";

interface MediaFile {
  id: number;
  type: string;
  fileName: string | null;
}

interface Props {
  files: MediaFile[];
  onDelete?: (id: number) => void;
}

export default function MediaPreview({ files, onDelete }: Props) {
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  if (!files || files.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {files.map((f, i) => (
          <div key={f.id} className="relative group aspect-square animate-fadeInUp" style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
            {f.type === "photo" ? (
              <img
                src={mediaUrl(f.id)}
                alt={f.fileName || "photo"}
                onClick={() => setGalleryIndex(i)}
                className="w-full h-full object-cover rounded-xl bg-elev ring-1 ring-line cursor-pointer transition-transform duration-200 ease-tg hover:scale-[1.03] hover:ring-brand/50"
                loading="lazy"
              />
            ) : f.type === "video" || f.type === "animation" ? (
              <div
                onClick={() => setGalleryIndex(i)}
                className="relative w-full h-full rounded-xl overflow-hidden bg-black ring-1 ring-line cursor-pointer transition-transform duration-200 ease-tg hover:scale-[1.03] hover:ring-brand/50"
              >
                <video
                  src={mediaUrl(f.id) + "#t=0.5"}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/25 flex items-center justify-center">
                    <Icon name="play_arrow" size={20} className="text-white ml-px" />
                  </div>
                </div>
              </div>
            ) : (
              <a
                href={mediaUrl(f.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center w-full h-full rounded-xl bg-elev ring-1 ring-line text-muted hover:text-brand hover:ring-brand/50 transition-colors"
              >
                <Icon name="description" size={24} />
                <span className="text-[10px] mt-1 truncate max-w-full px-1.5">{f.fileName || "file"}</span>
              </a>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
                title="Видалити файл"
                className="press absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-danger text-white flex items-center justify-center shadow-lift opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {galleryIndex !== null && (
        <MediaGallery
          files={files}
          initialIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
        />
      )}
    </>
  );
}
