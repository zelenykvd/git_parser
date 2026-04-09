import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchChannels, addChannel as apiAddChannel, deleteChannel as apiDeleteChannel, fetchTelegramDialogs } from "../api";
import TargetAutocomplete from "../components/TargetAutocomplete";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";

interface Channel {
  id: number;
  username: string | null;
  telegramId: string | null;
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

const DIALOGS_CACHE_KEY = "tg_dialogs_cache";
const DIALOGS_CACHE_TTL = 5 * 60 * 1000;

function getCachedDialogs(): TelegramDialog[] | null {
  try {
    const raw = sessionStorage.getItem(DIALOGS_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > DIALOGS_CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedDialogs(data: TelegramDialog[]) {
  try { sessionStorage.setItem(DIALOGS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
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
  const [showSubs, setShowSubs] = useState(true);
  const [filter, setFilter] = useState("");

  function load() {
    setLoading(true);
    fetchChannels().then(setChannels).catch(console.error).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (dialogsLoaded) return;
    let cancelled = false;
    setDialogsLoading(true);
    fetchTelegramDialogs()
      .then((data) => { if (!cancelled) { setDialogs(data); setDialogsLoaded(true); setCachedDialogs(data); } })
      .catch((err: any) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setDialogsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function handleAddSelected() {
    setError(""); setAdding(true);
    try {
      const toAdd = dialogs.filter((d) => selected.has(d.id) && !isAlreadyAdded(d));
      for (const d of toAdd) {
        await apiAddChannel({ username: d.username || undefined, telegramId: d.username ? undefined : d.id, title: d.title || undefined });
      }
      setSelected(new Set()); load();
    } catch (err: any) { setError(err.message); }
    finally { setAdding(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Видалити канал?")) return;
    try { await apiDeleteChannel(id); load(); } catch (err: any) { setError(err.message); }
  }

  function isAlreadyAdded(dialog: TelegramDialog): boolean {
    return channels.some((ch) =>
      (ch.username && dialog.username && ch.username === dialog.username) ||
      (ch.telegramId && ch.telegramId === dialog.id)
    );
  }

  const selectedCount = [...selected].filter((id) => { const d = dialogs.find((x) => x.id === id); return d && !isAlreadyAdded(d); }).length;
  const filteredDialogs = filter.trim()
    ? dialogs.filter((d) => { const q = filter.toLowerCase(); return d.title.toLowerCase().includes(q) || (d.username && d.username.toLowerCase().includes(q)); })
    : dialogs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Icon name="rss_feed" size={22} className="text-neutral-400" />
          <div>
            <h1 className="text-lg font-semibold">Канали</h1>
            <p className="text-xs text-neutral-400">{loading ? "..." : `${channels.length} каналів`}</p>
          </div>
        </div>
        <button
          onClick={() => setShowSubs((v) => !v)}
          disabled={dialogsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          <Icon name={showSubs ? "expand_less" : "expand_more"} size={16} />
          {dialogsLoading ? "Завантаження..." : showSubs ? "Сховати підписки" : "Підписки"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-2 border border-red-200">
          <Icon name="error" size={16} /> {error}
        </div>
      )}

      {/* Channels Grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white p-4 space-y-3">
              <div className="h-4 w-28 bg-shimmer animate-shimmer" />
              <div className="h-8 w-full bg-shimmer animate-shimmer" />
              <div className="h-3 w-20 bg-shimmer animate-shimmer" />
            </div>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-16 bg-white border border-neutral-200">
          <Icon name="rss_feed" size={40} className="text-neutral-200 mx-auto" />
          <p className="text-neutral-400 text-sm mt-2">Каналів немає</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200">
          {channels.map((ch, i) => (
            <div key={ch.id} className="bg-white p-4 space-y-3 animate-fadeInUp group" style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}>
              <div className="flex items-start gap-3">
                <Link to={`/channels/${ch.id}`} className="flex items-start gap-3 min-w-0 flex-1">
                  <Avatar
                    id={ch.username || ch.telegramId || String(ch.id)}
                    title={ch.title || ch.username || ""}
                    hasAvatar={dialogs.some((d) => ((ch.username && d.username === ch.username) || (ch.telegramId && d.id === ch.telegramId)) && d.hasAvatar)}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-sm truncate block">{ch.title || (ch.username ? `@${ch.username}` : "Приватний")}</span>
                    <span className="text-xs text-neutral-400">{ch.username ? `@${ch.username}` : ch.telegramId || ""}</span>
                  </div>
                </Link>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(ch.id); }}
                  className="p-1 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <Icon name="delete" size={16} />
                </button>
              </div>

              <div>
                <label className="flex items-center gap-1 text-[10px] font-medium text-neutral-400 uppercase tracking-wide mb-1">
                  <Icon name="adjust" size={12} /> Target
                </label>
                <TargetAutocomplete channel={ch} dialogs={dialogs} dialogsLoaded={dialogsLoaded} onSaved={load} />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <span className="flex items-center gap-1">
                  <Icon name={ch.active ? "radio_button_checked" : "radio_button_unchecked"} size={14}
                    className={ch.active ? "text-emerald-500" : "text-neutral-300"} />
                  <span className={`text-xs ${ch.active ? "text-emerald-600" : "text-neutral-400"}`}>
                    {ch.active ? "Активний" : "Неактивний"}
                  </span>
                </span>
                <span className="text-xs text-neutral-300">{new Date(ch.createdAt).toLocaleDateString("uk-UA")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Subscriptions */}
      {showSubs && dialogsLoaded && (
        <div className="animate-fadeIn">
          <div className="bg-white border border-neutral-200 p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2 className="text-sm font-semibold">Мої підписки ({dialogs.length})</h2>
              {selectedCount > 0 && (
                <button onClick={handleAddSelected} disabled={adding}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  <Icon name="add" size={14} />
                  {adding ? "..." : `Додати (${selectedCount})`}
                </button>
              )}
            </div>

            <div className="relative mb-4">
              <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder="Фільтр..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-neutral-200 focus:outline-none focus:border-neutral-900 transition-colors" />
            </div>

            {filteredDialogs.length === 0 ? (
              <p className="text-neutral-400 text-sm py-4 text-center">Нічого не знайдено</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto scrollbar-thin space-y-0 divide-y divide-neutral-100">
                {filteredDialogs.map((d, i) => {
                  const added = isAlreadyAdded(d);
                  return (
                    <div key={d.id} onClick={() => !added && toggleSelect(d.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors animate-fadeInUp ${
                        added ? "opacity-40" : selected.has(d.id) ? "bg-blue-50 cursor-pointer" : "hover:bg-neutral-50 cursor-pointer"
                      }`}
                      style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}>
                      <input type="checkbox" checked={added || selected.has(d.id)} disabled={added}
                        onChange={() => toggleSelect(d.id)} className="shrink-0 accent-neutral-900" />
                      <Avatar id={d.id} title={d.title} size="sm" hasAvatar={d.hasAvatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{d.title}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-px shrink-0 ${d.isChannel ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}>
                            {d.isChannel ? "Канал" : "Група"}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-400 flex gap-2">
                          <span>{d.username ? `@${d.username}` : "Приватний"}</span>
                          {d.participantsCount != null && <span>{d.participantsCount.toLocaleString("uk-UA")}</span>}
                        </div>
                      </div>
                      {added && <span className="text-[10px] text-emerald-600 font-medium shrink-0">Додано</span>}
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
