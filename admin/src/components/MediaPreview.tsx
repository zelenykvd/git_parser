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
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
        {files.map((f, i) => (
          <div key={f.id} className="relative group aspect-square">
            {f.type === "photo" ? (
              <img
                src={mediaUrl(f.id)}
                alt={f.fileName || "photo"}
                onClick={() => setGalleryIndex(i)}
                className="w-full h-full object-cover border border-neutral-200 cursor-pointer hover:opacity-90 transition-opacity bg-neutral-100"
                loading="lazy"
              />
            ) : f.type === "video" || f.type === "animation" ? (
              <div
                onClick={() => setGalleryIndex(i)}
                className="relative w-full h-full bg-neutral-900 border border-neutral-200 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <video
                  src={mediaUrl(f.id) + "#t=0.5"}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                    <Icon name="play_arrow" size={18} className="text-white ml-px" />
                  </div>
                </div>
              </div>
            ) : (
              <a
                href={mediaUrl(f.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center w-full h-full bg-neutral-50 border border-neutral-200 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <Icon name="description" size={24} />
                <span className="text-[10px] mt-1 truncate max-w-full px-1">{f.fileName || "file"}</span>
              </a>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
                className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
