import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";

interface Post {
  id: number;
  originalText: string;
  translatedText: string | null;
  status: string;
  createdAt: string;
  channel: { username: string };
  mediaFiles: { id: number }[];
}

export default function PostCard({ post }: { post: Post }) {
  return (
    <Link
      to={`/posts/${post.id}`}
      className="block bg-white rounded-lg shadow hover:shadow-md transition p-3 sm:p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">@{post.channel.username}</span>
        <StatusBadge status={post.status} />
      </div>
      <p className="text-sm text-gray-800 line-clamp-3 whitespace-pre-wrap">
        {post.translatedText || post.originalText}
      </p>
      <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
        <span>{new Date(post.createdAt).toLocaleString("uk-UA")}</span>
        {post.mediaFiles.length > 0 && (
          <span>{post.mediaFiles.length} медіа</span>
        )}
      </div>
    </Link>
  );
}
