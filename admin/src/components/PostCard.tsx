import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import Icon from "./Icon";
import { mediaUrl } from "../api";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default function PostCard({ post }: { post: any }) {
  const text = stripHtml(post.translatedText || post.originalText || "");
  const channel = post.channel?.username ? `@${post.channel.username}` : post.channel?.title || "";
  const media = post.mediaFiles || [];
  const firstMedia = media[0];
  const extraCount = media.length - 1;

  return (
    <Link
      to={`/posts/${post.id}`}
      className="block bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all active:bg-neutral-50 overflow-hidden"
    >
      {/* Media banner */}
      {firstMedia && (
        <div className="relative">
          {firstMedia.type === "photo" ? (
            <img
              src={mediaUrl(firstMedia.id)}
              alt=""
              className="w-full aspect-video object-cover bg-neutral-100"
              loading="lazy"
            />
          ) : firstMedia.type === "video" || firstMedia.type === "animation" ? (
            <div className="relative w-full aspect-video bg-neutral-900">
              <video
                src={mediaUrl(firstMedia.id) + "#t=0.5"}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <Icon name="play_arrow" size={24} className="text-white ml-0.5" />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full py-6 bg-neutral-100 flex items-center justify-center">
              <Icon name="description" size={28} className="text-neutral-300" />
            </div>
          )}

          {/* +N badge */}
          {extraCount > 0 && (
            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-medium px-1.5 py-0.5 flex items-center gap-0.5">
              <Icon name="photo_library" size={12} />
              +{extraCount}
            </div>
          )}

          {/* Type badge for video */}
          {(firstMedia.type === "video" || firstMedia.type === "animation") && (
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 flex items-center gap-0.5">
              <Icon name="videocam" size={12} />
              Video
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 pt-2.5 pb-1.5">
        <span className="text-xs text-neutral-400 font-medium truncate mr-2">{channel}</span>
        <StatusBadge status={post.status} />
      </div>

      {/* Body */}
      <div className="px-3 sm:px-4 pb-2.5">
        <p className="text-sm text-neutral-800 line-clamp-2 leading-relaxed break-words">
          {text}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-t border-neutral-100 text-xs text-neutral-400">
        <span>{new Date(post.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <Icon name="chevron_right" size={16} className="text-neutral-300" />
      </div>
    </Link>
  );
}
