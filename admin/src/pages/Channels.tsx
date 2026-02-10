import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchChannels,
  addChannel as apiAddChannel,
  deleteChannel as apiDeleteChannel,
  fetchTelegramDialogs,
  telegramAvatarUrl,
} from "../api";
import TargetAutocomplete from "../components/TargetAutocomplete";
import {
  Rss,
  Download,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  AlertTriangle,
  Trash2,
  Search,
  Hash,
  CircleDot,
  CircleOff,
  Target,
} from "lucide-react";

interface Channel {
  id: number;
  username: string;
  title: string | null;
  active: boolean;
  targetChannelId: string | null;
  createdAt: string;
}

interface TelegramDialog {
  id: string;
  title: string;
  username: string | null;
  isChannel: boolean;
  isGroup: boolean;
  participantsCount: number | null;
  hasAvatar?: boolean;
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

function Avatar({ id, title, hasAvatar = true }: { id: string; title: string; hasAvatar?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const letter = (title || "?")[0].toUpperCase();

  useEffect(() => {
    if (!hasAvatar) return;
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
  }, [id, hasAvatar]);

  if (!src) {
    return (
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${hashColor(id)}`}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className="w-8 h-8 rounded-full object-cover shrink-0"
    />
  );
}

function ChannelCard({
  ch,
  index,
  dialogs,
  dialogsLoaded,
  onSaved,
  onDelete,
}: {
  ch: Channel;
  index: number;
  dialogs: TelegramDialog[];
  dialogsLoaded: boolean;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 animate-fadeInUp"
      style={{
        animationDelay: `${Math.min(index * 50, 300)}ms`,
        animationFillMode: "both",
      }}
    >
      <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />

      <div className="p-4 space-y-3">
        {/* Header with avatar */}
        <div className="flex items-start gap-3">
          <Link to={`/channels/${ch.id}`} className="flex items-start gap-3 min-w-0 flex-1">
            <Avatar id={ch.username} title={ch.title || ch.username} hasAvatar={dialogs.some((d) => d.username === ch.username && d.hasAvatar)} />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-sm truncate block">
                {ch.title || `@${ch.username}`}
              </span>
              <span className="text-xs text-gray-400">@{ch.username}</span>
            </div>
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(ch.id); }}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0 -mr-1"
            title="Видалити"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Target autocomplete */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
            <Target className="w-3 h-3" />
            Цільовий канал
          </label>
          <TargetAutocomplete
            channel={ch}
            dialogs={dialogs}
            dialogsLoaded={dialogsLoaded}
            onSaved={onSaved}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className="inline-flex items-center gap-1.5">
            {ch.active ? (
              <CircleDot className="w-3.5 h-3.5 text-green-500 animate-pulse" />
            ) : (
              <CircleOff className="w-3.5 h-3.5 text-gray-400" />
            )}
            <span
              className={`text-xs font-medium ${
                ch.active ? "text-green-600" : "text-gray-400"
              }`}
            >
              {ch.active ? "Активний" : "Неактивний"}
            </span>
          </span>
          <span className="text-xs text-gray-400">
            {new Date(ch.createdAt).toLocaleDateString("uk-UA")}
          </span>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-1 bg-shimmer animate-shimmer" />
      <div className="p-4 space-y-3">
        <div className="h-5 w-32 rounded bg-shimmer animate-shimmer" />
        <div className="h-9 w-full rounded-lg bg-shimmer animate-shimmer" />
        <div className="flex justify-between pt-2 border-t border-gray-100">
          <div className="h-4 w-20 rounded bg-shimmer animate-shimmer" />
          <div className="h-4 w-16 rounded bg-shimmer animate-shimmer" />
        </div>
      </div>
    </div>
  );
}

const DIALOGS_CACHE_KEY = "tg_dialogs_cache";
const DIALOGS_CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCachedDialogs(): TelegramDialog[] | null {
  try {
    const raw = sessionStorage.getItem(DIALOGS_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > DIALOGS_CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function setCachedDialogs(data: TelegramDialog[]) {
  try {
    sessionStorage.setItem(DIALOGS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogs, setDialogs] = useState<TelegramDialog[]>(() => getCachedDialogs() || []);
  const [dialogsLoading, setDialogsLoading] = useState(false);
  const [dialogsLoaded, setDialogsLoaded] = useState(() => !!getCachedDialogs());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const [showSubscriptions, setShowSubscriptions] = useState(true);
  const [filter, setFilter] = useState("");

  function load() {
    setLoading(true);
    fetchChannels()
      .then(setChannels)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    console.log("[Channels] auto-fetch effect, dialogsLoaded:", dialogsLoaded);
    if (dialogsLoaded) return;
    console.log("[Channels] starting fetch...");
    let cancelled = false;

    setDialogsLoading(true);
    fetchTelegramDialogs()
      .then((data) => {
        if (cancelled) return;
        setDialogs(data);
        setDialogsLoaded(true);
        setCachedDialogs(data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error("Failed to load dialogs:", err);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDialogsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  async function handleLoadDialogs() {
    if (dialogsLoading || dialogsLoaded) return;
    setDialogsLoading(true);
    try {
      const data = await fetchTelegramDialogs();
      setDialogs(data);
      setDialogsLoaded(true);
      setCachedDialogs(data);
      setSelected(new Set());
    } catch (err: any) {
      console.error("Failed to load dialogs:", err);
      setError(err.message);
    } finally {
      setDialogsLoading(false);
    }
  }

  async function handleToggleSubscriptions() {
    if (!showSubscriptions) {
      if (!dialogsLoaded && !dialogsLoading) await handleLoadDialogs();
      setShowSubscriptions(true);
    } else {
      setShowSubscriptions(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSelected() {
    setError("");
    setAdding(true);
    try {
      const toAdd = dialogs.filter(
        (d) => selected.has(d.id) && !isAlreadyAdded(d)
      );
      for (const d of toAdd) {
        const username = d.username || d.id;
        await apiAddChannel(username, d.title || undefined);
      }
      setSelected(new Set());
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Видалити цей канал?")) return;
    try {
      await apiDeleteChannel(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function isAlreadyAdded(dialog: TelegramDialog): boolean {
    return channels.some(
      (ch) =>
        ch.username === dialog.username ||
        ch.username === dialog.id
    );
  }

  const selectedCount = [...selected].filter((id) => {
    const item = dialogs.find((d) => d.id === id);
    return item && !isAlreadyAdded(item);
  }).length;

  const filteredDialogs = filter.trim()
    ? dialogs.filter((d) => {
        const q = filter.toLowerCase();
        return (
          d.title.toLowerCase().includes(q) ||
          (d.username && d.username.toLowerCase().includes(q))
        );
      })
    : dialogs;

  return (
    <div className="space-y-6">
      {/* Page Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Rss className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Канали</h1>
              <p className="text-sm text-gray-500">
                {loading ? "Завантаження..." : `${channels.length} каналів`}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleSubscriptions}
            disabled={dialogsLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            {dialogsLoading
              ? "Завантаження..."
              : showSubscriptions
                ? "Сховати підписки"
                : "Завантажити підписки"}
            {showSubscriptions ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl animate-fadeIn flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Channels Grid (ALWAYS FIRST) */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 py-16 px-6 text-center">
          <div className="mx-auto w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Rss className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Каналів ще немає
          </h3>
          <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">
            Завантажте свої підписки, щоб додати канали для моніторингу
          </p>
          <button
            onClick={handleToggleSubscriptions}
            disabled={dialogsLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Завантажити підписки
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch, i) => (
            <ChannelCard
              key={ch.id}
              ch={ch}
              index={i}
              dialogs={dialogs}
              dialogsLoaded={dialogsLoaded}
              onSaved={load}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Subscriptions Panel (ALWAYS BELOW channels, toggle-controlled) */}
      {showSubscriptions && dialogsLoaded && (
        <div className="animate-slideDown overflow-hidden">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Мої підписки ({dialogs.length})
              </h2>
              {selectedCount > 0 && (
                <button
                  onClick={handleAddSelected}
                  disabled={adding}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  {adding
                    ? "Додавання..."
                    : `Додати вибрані (${selectedCount})`}
                </button>
              )}
            </div>

            {/* Filter input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Фільтр за назвою..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {filteredDialogs.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">
                Підписок не знайдено
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-2 scrollbar-thin">
                {filteredDialogs.map((d, i) => {
                  const added = isAlreadyAdded(d);
                  return (
                    <div
                      key={d.id}
                      onClick={() => !added && toggleSelect(d.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition animate-fadeInUp ${
                        added
                          ? "border-green-200 bg-green-50 opacity-60"
                          : selected.has(d.id)
                            ? "border-blue-400 bg-blue-50 cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 cursor-pointer"
                      }`}
                      style={{
                        animationDelay: `${Math.min(i * 30, 300)}ms`,
                        animationFillMode: "both",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={added || selected.has(d.id)}
                        disabled={added}
                        onChange={() => toggleSelect(d.id)}
                        className="rounded shrink-0"
                      />
                      <Avatar id={d.id} title={d.title} hasAvatar={d.hasAvatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {d.title}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
                              d.isChannel
                                ? "bg-blue-100 text-blue-700"
                                : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {d.isChannel ? "Канал" : "Група"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex gap-3 mt-0.5">
                          <span>
                            {d.username ? `@${d.username}` : "—"}
                          </span>
                          {d.participantsCount != null && (
                            <span>
                              {d.participantsCount.toLocaleString("uk-UA")}{" "}
                              учасників
                            </span>
                          )}
                        </div>
                      </div>
                      {added && (
                        <span className="text-xs text-green-600 font-medium shrink-0">
                          Додано
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
