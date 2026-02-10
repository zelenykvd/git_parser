import { mediaUrl } from "../api";

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
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((f) => (
        <div key={f.id} className="relative group">
          {f.type === "photo" ? (
            <img
              src={mediaUrl(f.id)}
              alt={f.fileName || "photo"}
              className="w-32 h-32 object-cover rounded border"
            />
          ) : f.type === "video" || f.type === "animation" ? (
            <video
              src={mediaUrl(f.id)}
              className="w-32 h-32 object-cover rounded border"
              controls
            />
          ) : (
            <a
              href={mediaUrl(f.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-32 h-32 bg-gray-100 rounded border text-sm text-gray-600"
            >
              {f.fileName || "file"}
            </a>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(f.id)}
              className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              &times;
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
