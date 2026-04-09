import { useEffect, useState } from "react";
import { fetchPosts } from "../api";
import PostCard from "../components/PostCard";
import Icon from "../components/Icon";

const STATUSES = ["", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"];
const STATUS_LABELS: Record<string, string> = {
  "": "Всі",
  PENDING: "Очікують",
  APPROVED: "Схвалені",
  REJECTED: "Відхилені",
  PUBLISHED: "Опубліковані",
};

export default function PostList() {
  const [posts, setPosts] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPosts({ status: status || undefined, isHistorical: false, page })
      .then((data) => { setPosts(data.posts); setTotalPages(data.totalPages); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Пости</h1>
      </div>

      <div className="flex gap-1 mb-6 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              status === s
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-300"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400 text-sm py-12 justify-center">
          <Icon name="progress_activity" size={18} className="animate-spin" />
          Завантаження...
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="inbox" size={40} className="text-neutral-300 mx-auto" />
          <p className="text-neutral-400 text-sm mt-2">Постів не знайдено</p>
        </div>
      ) : (
        <div className="grid gap-px bg-neutral-200 border border-neutral-200 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-neutral-200 disabled:opacity-30 hover:border-neutral-300 transition-colors"
          >
            <Icon name="chevron_left" size={16} />
            Назад
          </button>
          <span className="text-xs text-neutral-400 tabular-nums">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-neutral-200 disabled:opacity-30 hover:border-neutral-300 transition-colors"
          >
            Далі
            <Icon name="chevron_right" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
