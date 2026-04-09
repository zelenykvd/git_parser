import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import Icon from "./Icon";

export default function PostCard({ post }: { post: any }) {
  return (
    <Link
      to={`/posts/${post.id}`}
      className="block bg-white border border-neutral-200 p-4 hover:border-neutral-300 transition-colors animate-fadeInUp"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-neutral-400 font-medium">
          {post.channel?.username ? `@${post.channel.username}` : post.channel?.title || ""}
        </span>
        <StatusBadge status={post.status} />
      </div>
      <p className="text-sm text-neutral-700 line-clamp-3 whitespace-pre-wrap leading-relaxed">
        {post.translatedText || post.originalText}
      </p>
      <div className="flex items-center justify-between mt-3 text-xs text-neutral-400">
        <span>{new Date(post.createdAt).toLocaleString("uk-UA")}</span>
        {post.mediaFiles?.length > 0 && (
          <span className="flex items-center gap-0.5">
            <Icon name="image" size={14} />
            {post.mediaFiles.length}
          </span>
        )}
      </div>
    </Link>
  );
}
