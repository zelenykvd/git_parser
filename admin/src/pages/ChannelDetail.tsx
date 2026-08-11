import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchChannels, fetchPosts, translatePost, startFetchHistory, fetchTaskStatus, cancelFetchHistory } from "../api";
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
  const [fetchError, setFetchError] = useState("");

  useEffect(() => { fetchChannels().then((chs: Channel[]) => setChannel(chs.find((c) => c.id === channelId) || null)).catch(console.error); }, [channelId]);

  function loadPosts() {
    setLoading(true);
    fetchPosts({ channelId, status: status || undefined, since: periodToSince(period), page })
      .then((data) => { setPosts(data.posts); setTotalPages(data.totalPages); })
      .catch(console.error).finally(() => setLoading(false));
  }
  useEffect(() => { loadPosts(); }, [channelId, status, period, page]);

  // Poll task status
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const s = await fetchTaskStatus(channelId);
        if (!active) return;
        if (s.active) {
          setHistoryProgress({ fetched: s.fetched, saved: s.saved, skipped: s.skipped, done: false });
          setTimeout(poll, 2000);
        } else if (s.fetched > 0) {
          setHistoryProgress({ fetched: s.fetched, saved: s.saved, skipped: s.skipped, done: true, error: s.error });
          loadPosts();
        } else {
          setHistoryProgress(null);
        }
      } catch {}
    }
    poll();
    return () => { active = false; };
  }, [channelId]);

  async function handleTranslate(postId: number) {
    setTranslatingId(postId);
    try { const u = await translatePost(postId); setPosts((p) => p.map((x) => x.id === postId ? { ...x, translatedText: u.translatedText, translationModel: u.translationModel } : x)); }
    catch {} finally { setTranslatingId(null); }
  }

  async function handleFetchHistory() {
    setFetchError("");
    try {
      await startFetchHistory(channelId, { since: periodToSince(period) });
      setHistoryProgress({ fetched: 0, saved: 0, skipped: 0, done: false });
      // Polling will pick up progress
    } catch (err: any) {
      setFetchError(err.message);
    }
  }

  async function handleCancelHistory() {
    await cancelFetchHistory(channelId).catch(() => {});
    setHistoryProgress((p) => p ? { ...p, done: true } : null);
    loadPosts();
  }

  const fetching = historyProgress && !historyProgress.done;
  const chLabel = channel?.title || (channel?.username ? `@${channel.username}` : "Приватний канал");

  const chipClass = (isActive: boolean) =>
    `press flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border ${
      isActive
        ? "brand-gradient text-white border-transparent shadow-brand"
        : "bg-card text-ink-2 border-line hover:border-line-2 hover:bg-elev"
    }`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-line rounded-card shadow-card p-4 sm:p-5">
        <Link to="/channels" className="group inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors mb-3">
          <Icon name="arrow_back" size={14} className="transition-transform duration-200 ease-tg group-hover:-translate-x-0.5" /> Канали
        </Link>
        {channel ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar id={channel.username || channel.telegramId || String(channel.id)} title={chLabel} size="lg" />
              <div>
                <h1 className="text-base sm:text-xl font-semibold tracking-tight">{chLabel}</h1>
                <div className="flex items-center gap-2.5 mt-0.5">
                  <span className="text-xs text-muted">{channel.username ? `@${channel.username}` : channel.telegramId || ""}</span>
                  <span className={`flex items-center gap-1 text-xs font-medium ${channel.active ? "text-success" : "text-muted"}`}>
                    <span className="relative flex w-1.5 h-1.5">
                      {channel.active && <span className="absolute inline-flex w-full h-full rounded-full bg-success animate-pulseRing" />}
                      <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${channel.active ? "bg-success" : "bg-faint"}`} />
                    </span>
                    {channel.active ? "Актив." : "Неактив."}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {fetching ? (
                <>
                  <span className="text-xs text-ink-2 flex items-center gap-1.5 tabular-nums">
                    <Icon name="progress_activity" size={14} className="animate-spin text-brand" />
                    {historyProgress!.fetched}/{historyProgress!.saved}
                  </span>
                  <button onClick={handleCancelHistory}
                    className="press flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border border-danger/30 text-danger hover:bg-danger-soft">
                    <Icon name="stop" size={14} /> Стоп
                  </button>
                </>
              ) : (
                <button onClick={handleFetchHistory}
                  className="press flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold brand-gradient text-white shadow-brand hover:brightness-105">
                  <Icon name="download" size={14} /> Історія
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="skeleton w-11 h-11 rounded-full" />
            <div className="space-y-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3 w-24" />
            </div>
          </div>
        )}

        {historyProgress?.done && !historyProgress.error && (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-success-soft text-success text-xs font-medium px-3 py-2 animate-popIn">
            <Icon name="check_circle" size={14} /> {historyProgress.saved} збережено, {historyProgress.skipped} пропущено
          </div>
        )}
        {(historyProgress?.error || fetchError) && (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-danger-soft text-danger text-xs px-3 py-2 animate-popIn">
            <Icon name="error" size={14} className="mt-px shrink-0" /> {historyProgress?.error || fetchError}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-thin">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={chipClass(status === s)}>
              <Icon name={STATUS_ICONS[s]} size={14} /> {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="hidden sm:block h-5 w-px bg-line" />
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-thin">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => { setPeriod(p); setPage(1); }} className={chipClass(period === p)}>
              <Icon name={PERIOD_ICONS[p]} size={14} /> {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="space-y-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-line rounded-card shadow-card overflow-hidden">
              <div className="skeleton w-full aspect-video rounded-none" />
              <div className="p-4 space-y-2.5">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-2/3" />
              </div>
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
              {!post.translatedText && (
                <button onClick={() => handleTranslate(post.id)} disabled={translatingId === post.id}
                  className="press flex items-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:text-brand hover:bg-brand-soft disabled:opacity-60">
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
        <div className="flex items-center justify-center gap-2 pt-2">
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
