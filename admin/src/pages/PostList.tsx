import { useEffect, useState } from "react";
import { fetchPosts } from "../api";
import PostCard from "../components/PostCard";
import Icon from "../components/Icon";

const STATUSES = ["", "PENDING", "APPROVED", "PUBLISHING", "REJECTED", "PUBLISHED"];
const STATUS_LABELS: Record<string, string> = { "": "Всі", PENDING: "Очікують", APPROVED: "Схвалені", PUBLISHING: "Публікуються", REJECTED: "Відхилені", PUBLISHED: "Опубліковані" };
const STATUS_ICONS: Record<string, string> = { "": "list", PENDING: "schedule", APPROVED: "check_circle", PUBLISHING: "sync", REJECTED: "cancel", PUBLISHED: "public" };

function PostSkeleton() {
  return (
    <div className="bg-card border border-line rounded-card shadow-card overflow-hidden">
      <div className="skeleton w-full aspect-video rounded-none" />
      <div className="p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="skeleton w-6 h-6 rounded-full" />
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    </div>
  );
}

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
      <h1 className="text-xl font-semibold tracking-tight mb-4">Пости</h1>

      {/* Filters - horizontal scroll on mobile */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-thin">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`press flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border ${
              status === s
                ? "brand-gradient text-white border-transparent shadow-brand"
                : "bg-card text-ink-2 border-line hover:border-line-2 hover:bg-elev"
            }`}>
            <Icon name={STATUS_ICONS[s]} size={14} />
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-fadeIn" style={{ animationDelay: `${i * 40}ms` }}>
              <PostSkeleton />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeInUp">
          <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-elev text-faint">
            <Icon name="inbox" size={32} />
          </span>
          <p className="text-muted text-sm mt-3">Постів не знайдено</p>
        </div>
      ) : (
        <div className="space-y-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:space-y-0">
          {posts.map((post, i) => (
            <div key={post.id} className="animate-fadeInUp" style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-7">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="press flex items-center gap-1 pl-2.5 pr-3.5 py-2 rounded-full text-sm bg-card border border-line hover:border-line-2 hover:bg-elev disabled:opacity-40 disabled:hover:bg-card">
            <Icon name="chevron_left" size={16} /> Назад
          </button>
          <span className="text-xs text-muted tabular-nums px-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="press flex items-center gap-1 pl-3.5 pr-2.5 py-2 rounded-full text-sm bg-card border border-line hover:border-line-2 hover:bg-elev disabled:opacity-40 disabled:hover:bg-card">
            Далі <Icon name="chevron_right" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
