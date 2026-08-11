import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import ModelBadge from "./ModelBadge";
import Avatar from "./Avatar";
import Icon from "./Icon";
import { mediaUrl } from "../api";
import { spawnRipple } from "../ripple";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default function PostCard({ post }: { post: any }) {
  const text = stripHtml(post.translatedText || post.originalText || "");
  const channel = post.channel?.username ? `@${post.channel.username}` : post.channel?.title || "";
  const media = post.mediaFiles || [];
  const firstMedia = media[0];
  const extraCount = media.length - 1;
  const avatarId = post.channel?.username || post.channel?.telegramId || String(post.channel?.id ?? post.id);

  return (
    <Link
      to={`/posts/${post.id}`}
      onPointerDown={spawnRipple}
      className="ripple-host group block bg-card border border-line rounded-card shadow-card overflow-hidden transition-[transform,box-shadow,border-color] duration-200 ease-tg hover:-translate-y-0.5 hover:shadow-lift hover:border-line-2 active:translate-y-0 active:shadow-card"
    >
      {/* Media banner */}
      {firstMedia && (
        <div className="relative overflow-hidden">
          {firstMedia.type === "photo" ? (
            <img
              src={mediaUrl(firstMedia.id)}
              alt=""
              className="w-full aspect-video object-cover bg-elev transition-transform duration-500 ease-tg group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : firstMedia.type === "video" || firstMedia.type === "animation" ? (
            <div className="relative w-full aspect-video bg-black">
              <video
                src={mediaUrl(firstMedia.id) + "#t=0.5"}
                className="w-full h-full object-cover transition-transform duration-500 ease-tg group-hover:scale-[1.04]"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center ring-1 ring-white/25 transition-transform duration-200 ease-tg group-hover:scale-110">
                  <Icon name="play_arrow" size={26} className="text-white ml-0.5" />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full py-8 bg-elev flex items-center justify-center">
              <Icon name="description" size={28} className="text-faint" />
            </div>
          )}

          {/* Scrim so the overlay chips stay readable on bright media */}
          <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

          {/* +N badge */}
          {extraCount > 0 && (
            <div className="absolute top-2 right-2 rounded-full bg-black/55 backdrop-blur-md text-white text-xs font-medium px-2 py-0.5 flex items-center gap-1">
              <Icon name="photo_library" size={12} />
              +{extraCount}
            </div>
          )}

          {/* Type badge for video */}
          {(firstMedia.type === "video" || firstMedia.type === "animation") && (
            <div className="absolute bottom-2 left-2 rounded-full bg-black/55 backdrop-blur-md text-white text-[10px] font-medium px-2 py-0.5 flex items-center gap-1">
              <Icon name="videocam" size={12} />
              Video
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar id={avatarId} title={post.channel?.title || channel} size="sm" />
          <span className="text-xs text-ink-2 font-medium truncate">{channel}</span>
        </div>
        <StatusBadge status={post.status} />
      </div>

      {/* Body */}
      <div className="px-3 sm:px-4 pb-3">
        <p className="text-sm text-ink line-clamp-2 leading-relaxed break-words">
          {text}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t border-line text-xs text-muted">
        <span className="shrink-0 tabular-nums">{new Date(post.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <div className="flex items-center gap-1 min-w-0">
          <ModelBadge model={post.translationModel} />
          <Icon
            name="chevron_right"
            size={16}
            className="text-faint shrink-0 transition-transform duration-200 ease-tg group-hover:translate-x-0.5 group-hover:text-brand"
          />
        </div>
      </div>
    </Link>
  );
}
