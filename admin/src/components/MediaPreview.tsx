import { mediaUrl } from "../api";
import Icon from "./Icon";

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
  if (!files || files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-3">
      {files.map((f) => (
        <div key={f.id} className="relative group">
          {f.type === "photo" ? (
            <img
              src={mediaUrl(f.id)}
              alt={f.fileName || "photo"}
              className="w-20 h-20 sm:w-28 sm:h-28 object-cover border border-neutral-200"
            />
          ) : f.type === "video" || f.type === "animation" ? (
            <video
              src={mediaUrl(f.id)}
              className="w-20 h-20 sm:w-28 sm:h-28 object-cover border border-neutral-200"
              controls
            />
          ) : (
            <a
              href={mediaUrl(f.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-20 h-20 sm:w-28 sm:h-28 bg-neutral-50 border border-neutral-200 text-xs text-neutral-500"
            >
              <Icon name="attachment" size={20} />
            </a>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(f.id)}
              className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
