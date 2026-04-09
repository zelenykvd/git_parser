import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import Icon from "./Icon";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default function PostCard({ post }: { post: any }) {
  const text = stripHtml(post.translatedText || post.originalText || "");
  const channel = post.channel?.username ? `@${post.channel.username}` : post.channel?.title || "";

  return (
    <Link
      to={`/posts/${post.id}`}
      className="block bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-sm transition-all active:bg-neutral-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-xs text-neutral-400 font-medium truncate mr-2">{channel}</span>
        <StatusBadge status={post.status} />
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        <p className="text-sm text-neutral-800 line-clamp-3 leading-relaxed break-words">
          {text}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-100 text-xs text-neutral-400">
        <span>{new Date(post.createdAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <div className="flex items-center gap-3">
          {post.mediaFiles?.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Icon name="photo_library" size={14} />
              {post.mediaFiles.length}
            </span>
          )}
          <Icon name="chevron_right" size={16} className="text-neutral-300" />
        </div>
      </div>
    </Link>
  );
}
