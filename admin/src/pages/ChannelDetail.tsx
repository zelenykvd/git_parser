import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchChannels, fetchPosts, translatePost, fetchChannelHistory } from "../api";
import PostCard from "../components/PostCard";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";

interface Channel { id: number; username: string | null; telegramId: string | null; title: string | null; active: boolean; targetChannelId: string | null; createdAt: string; }
interface HistoryProgress { fetched: number; saved: number; skipped: number; done: boolean; error?: string; }

const STATUSES = ["", "PENDING", "APPROVED", "REJECTED", "PUBLISHED"];
const STATUS_LABELS: Record<string, string> = { "": "Всі", PENDING: "Очікують", APPROVED: "Схвалені", REJECTED: "Відхилені", PUBLISHED: "Опубліковані" };
const STATUS_ICONS: Record<string, string> = { "": "list", PENDING: "schedule", APPROVED: "check_circle", REJECTED: "cancel", PUBLISHED: "public" };
const PERIODS = ["week", "month", "all"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = { week: "Тиждень", month: "Місяць", all: "Весь час" };
const PERIOD_ICONS: Record<Period, string> = { week: "date_range", month: "calendar_month", all: "all_inclusive" };

function periodToSince(period: Period): string | undefined {
  if (period === "all") return undefined;
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - 7); else d.setMonth(d.getMonth() - 1);
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

  useEffect(() => { fetchChannels().then((chs: Channel[]) => setChannel(chs.find((c) => c.id === channelId) || null)).catch(console.error); }, [channelId]);

  function loadPosts() {
    setLoading(true);
    fetchPosts({ channelId, status: status || undefined, since: periodToSince(period), page })
      .then((data) => { setPosts(data.posts); setTotalPages(data.totalPages); })
      .catch(console.error).finally(() => setLoading(false));
  }
  useEffect(() => { loadPosts(); }, [channelId, status, period, page]);

  async function handleTranslate(postId: number) {
    setTranslatingId(postId);
    try { const u = await translatePost(postId); setPosts((p) => p.map((x) => x.id === postId ? { ...x, translatedText: u.translatedText } : x)); }
    catch {} finally { setTranslatingId(null); }
  }

  function handleFetchHistory() {
    if (historyProgress && !historyProgress.done) return;
    setHistoryProgress({ fetched: 0, saved: 0, skipped: 0, done: false });
    const { cancel } = fetchChannelHistory(channelId, (p) => { setHistoryProgress(p); if (p.done) loadPosts(); }, { since: periodToSince(period) });
    cancelRef.current = cancel;
  }

  const fetching = historyProgress && !historyProgress.done;
  const chLabel = channel?.title || (channel?.username ? `@${channel.username}` : "Приватний канал");

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="bg-white border border-neutral-200 p-4">
        <Link to="/channels" className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors mb-3">
          <Icon name="arrow_back" size={14} /> Канали
        </Link>
        {channel ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar id={channel.username || channel.telegramId || String(channel.id)} title={chLabel} size="lg" />
              <div>
                <h1 className="text-base sm:text-lg font-semibold">{chLabel}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-neutral-400">{channel.username ? `@${channel.username}` : channel.telegramId || ""}</span>
                  <span className={`flex items-center gap-0.5 text-xs ${channel.active ? "text-emerald-600" : "text-neutral-400"}`}>
                    <Icon name={channel.active ? "radio_button_checked" : "radio_button_unchecked"} size={12} />
                    {channel.active ? "Актив." : "Неактив."}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {fetching ? (
                <>
                  <span className="text-xs text-neutral-500 flex items-center gap-1">
                    <Icon name="progress_activity" size={14} className="animate-spin" />
                    {historyProgress!.fetched}/{historyProgress!.saved}
                  </span>
                  <button onClick={() => { cancelRef.current?.(); setHistoryProgress((p) => p ? { ...p, done: true } : null); loadPosts(); }}
                    className="flex items-center gap-1 px-3 py-2 text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    <Icon name="stop" size={14} /> Стоп
                  </button>
                </>
              ) : (
                <button onClick={handleFetchHistory}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
                  <Icon name="download" size={14} /> Історія
                </button>
              )}
            </div>
          </div>
        ) : <div className="h-10 w-48 bg-shimmer animate-shimmer" />}

        {historyProgress?.done && !historyProgress.error && (
          <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-1">
            <Icon name="check_circle" size={14} /> {historyProgress.saved} збережено, {historyProgress.skipped} пропущено
          </div>
        )}
        {historyProgress?.error && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 flex items-center gap-1">
            <Icon name="error" size={14} /> {historyProgress.error}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row sm:items-center">
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-thin">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                status === s ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-300"
              }`}>
              <Icon name={STATUS_ICONS[s]} size={14} /> {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="hidden sm:block h-4 w-px bg-neutral-200" />
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-thin">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => { setPeriod(p); setPage(1); }}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                period === p ? "bg-neutral-700 text-white" : "bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-300"
              }`}>
              <Icon name={PERIOD_ICONS[p]} size={14} /> {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Icon name="progress_activity" size={24} className="animate-spin text-neutral-300" />
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
              {!post.translatedText && (
                <button onClick={() => handleTranslate(post.id)} disabled={translatingId === post.id}
                  className="flex items-center gap-1 mt-1 px-3 py-1.5 text-xs text-neutral-400 hover:text-blue-600 disabled:opacity-50 transition-colors">
                  {translatingId === post.id
                    ? <><Icon name="progress_activity" size={12} className="animate-spin" /> Перекладаю...</>
                    : <><Icon name="translate" size={12} /> Перекласти</>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
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
