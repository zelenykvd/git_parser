import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchChannels, fetchPosts, translatePost, fetchChannelHistory, telegramAvatarUrl } from "../api";
import PostCard from "../components/PostCard";
import { ArrowLeft, CircleDot, CircleOff, Loader2, Download } from "lucide-react";

interface Channel {
  id: number;
  username: string;
  title: string | null;
  active: boolean;
  targetChannelId: string | null;
  createdAt: string;
}

interface HistoryProgress {
  fetched: number;
  saved: number;
  skipped: number;
  done: boolean;
  error?: string;
}

const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-green-500",
  "bg-teal-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ id, title }: { id: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const letter = (title || "?")[0].toUpperCase();

  useEffect(() => {
    let cancelled = false;
    fetch(telegramAvatarUrl(id))
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => {
        if (!cancelled) setSrc(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  if (!src) {
    return (
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${hashColor(id)}`}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className="w-10 h-10 rounded-full object-cover shrink-0"
    />
  );
}

const STATUSES = ["", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"];
const STATUS_LABELS: Record<string, string> = {
  "": "Всі",
  PENDING: "Очікують",
  APPROVED: "Схвалені",
  REJECTED: "Відхилені",
  PUBLISHED: "Опубліковані",
};

const PERIODS = ["week", "month", "all"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  week: "Тиждень",
  month: "Місяць",
  all: "Весь час",
};

function periodToSince(period: Period): string | undefined {
  if (period === "all") return undefined;
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - 7);
  else if (period === "month") d.setMonth(d.getMonth() - 1);
  return d.toISOString();
}

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>();
  const channelId = Number(id);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [translatingId, setTranslatingId] = useState<number | null>(null);

  const [historyProgress, setHistoryProgress] = useState<HistoryProgress | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchChannels()
      .then((channels: Channel[]) => {
        const found = channels.find((ch) => ch.id === channelId);
        setChannel(found || null);
      })
      .catch(console.error);
  }, [channelId]);

  function loadPosts() {
    setLoading(true);
    fetchPosts({ channelId, status: status || undefined, since: periodToSince(period), page })
      .then((data) => {
        setPosts(data.posts);
        setTotalPages(data.totalPages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPosts();
  }, [channelId, status, period, page]);

  async function handleTranslate(postId: number) {
    setTranslatingId(postId);
    try {
      const updated = await translatePost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, translatedText: updated.translatedText } : p))
      );
    } catch (err: any) {
      console.error("Translation failed:", err);
    } finally {
      setTranslatingId(null);
    }
  }

  function handleFetchHistory() {
    if (historyProgress && !historyProgress.done) return;
    setHistoryProgress({ fetched: 0, saved: 0, skipped: 0, done: false });

    const { cancel } = fetchChannelHistory(channelId, (p) => {
      setHistoryProgress(p);
      if (p.done) {
        loadPosts();
      }
    }, { since: periodToSince(period) });
    cancelRef.current = cancel;
  }

  function handleCancelHistory() {
    cancelRef.current?.();
    setHistoryProgress((prev) => prev ? { ...prev, done: true } : null);
    loadPosts();
  }

  const fetching = historyProgress && !historyProgress.done;

  return (
    <div className="space-y-6">
      {/* Channel Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <Link
          to="/channels"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Канали
        </Link>

        {channel ? (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Avatar id={channel.username} title={channel.title || channel.username} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {channel.title || `@${channel.username}`}
                </h1>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-sm text-gray-500">@{channel.username}</span>
                  <span className="inline-flex items-center gap-1">
                    {channel.active ? (
                      <CircleDot className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <CircleOff className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span
                      className={`text-xs font-medium ${
                        channel.active ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      {channel.active ? "Активний" : "Неактивний"}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Fetch history button */}
            <div className="flex items-center gap-3">
              {fetching ? (
                <>
                  <div className="text-sm text-gray-600">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
                    {historyProgress!.fetched} повідомлень / {historyProgress!.saved} збережено
                  </div>
                  <button
                    onClick={handleCancelHistory}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Зупинити
                  </button>
                </>
              ) : (
                <button
                  onClick={handleFetchHistory}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Завантажити історію
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="h-10 w-48 rounded bg-gray-100 animate-pulse" />
        )}

        {/* History result message */}
        {historyProgress?.done && !historyProgress.error && (
          <div className="mt-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Готово: {historyProgress.saved} постів збережено, {historyProgress.skipped} пропущено
          </div>
        )}
        {historyProgress?.error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Помилка: {historyProgress.error}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="flex gap-2 flex-wrap">
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

        <div className="hidden sm:block h-5 w-px bg-gray-300" />

        <div className="flex gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                period === p
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-700 border hover:bg-gray-50"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Posts grid */}
      {loading ? (
        <p className="text-gray-500">Завантаження...</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-500">Постів не знайдено</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <div key={post.id} className="flex flex-col">
              <PostCard post={post} />
              {!post.translatedText && (
                <button
                  onClick={() => handleTranslate(post.id)}
                  disabled={translatingId === post.id}
                  className="mt-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
                >
                  {translatingId === post.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Перекладаю...
                    </>
                  ) : (
                    "Перекласти"
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
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
