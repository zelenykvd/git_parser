import { useEffect, useState } from "react";
import { fetchPosts } from "../api";
import PostCard from "../components/PostCard";

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
      .then((data) => {
        setPosts(data.posts);
        setTotalPages(data.totalPages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, page]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Пости</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              status === s
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border hover:bg-gray-50"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Завантаження...</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-500">Постів не знайдено</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            className="px-3 py-1 rounded border disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded border disabled:opacity-40"
          >
            Далі
          </button>
        </div>
      )}
    </div>
  );
}
