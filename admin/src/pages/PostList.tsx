import { useEffect, useState } from "react";
import { fetchPosts } from "../api";
import PostCard from "../components/PostCard";
import Icon from "../components/Icon";

const STATUSES = ["", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"];
const STATUS_LABELS: Record<string, string> = { "": "Всі", PENDING: "Очікують", APPROVED: "Схвалені", REJECTED: "Відхилені", PUBLISHED: "Опубліковані" };
const STATUS_ICONS: Record<string, string> = { "": "list", PENDING: "schedule", APPROVED: "check_circle", REJECTED: "cancel", PUBLISHED: "public" };

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
      <h1 className="text-lg font-semibold mb-4">Пости</h1>

      {/* Filters - horizontal scroll on mobile */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-thin">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
              status === s
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-300"
            }`}>
            <Icon name={STATUS_ICONS[s]} size={14} />
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400 text-sm py-16 justify-center">
          <Icon name="progress_activity" size={20} className="animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <Icon name="inbox" size={48} className="text-neutral-200 mx-auto" />
          <p className="text-neutral-400 text-sm mt-3">Постів не знайдено</p>
        </div>
      ) : (
        <div className="space-y-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:space-y-0">
          {posts.map((post, i) => (
            <div key={post.id} className="animate-fadeInUp" style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-neutral-200 disabled:opacity-30 hover:border-neutral-300 transition-colors">
            <Icon name="chevron_left" size={16} /> Назад
          </button>
          <span className="text-xs text-neutral-400 tabular-nums">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-2 text-sm border border-neutral-200 disabled:opacity-30 hover:border-neutral-300 transition-colors">
            Далі <Icon name="chevron_right" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
