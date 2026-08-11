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
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-brand-soft text-brand">
            <Icon name="rss_feed" size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Канали</h1>
            <p className="text-xs text-muted">{loading ? "..." : `${channels.length} каналів`}</p>
          </div>
        </div>
        <button
          onClick={() => setShowSubs((v) => !v)}
          disabled={dialogsLoading}
          className="press flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold brand-gradient text-white shadow-brand hover:brightness-105 disabled:opacity-60"
        >
          <Icon
            name={dialogsLoading ? "progress_activity" : "expand_more"}
            size={16}
            className={`transition-transform duration-200 ease-tg ${dialogsLoading ? "animate-spin" : showSubs ? "rotate-180" : ""}`}
          />
          {dialogsLoading ? "Завантаження..." : showSubs ? "Сховати підписки" : "Підписки"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm px-4 py-2.5 animate-popIn">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Channels Grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-line rounded-card shadow-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="skeleton w-8 h-8 rounded-full" />
                <div className="skeleton h-3.5 w-28" />
              </div>
              <div className="skeleton h-9 w-full rounded-xl" />
              <div className="skeleton h-3 w-20" />
            </div>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-line rounded-card shadow-card">
          <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-elev text-faint">
            <Icon name="rss_feed" size={32} />
          </span>
          <p className="text-muted text-sm mt-3">Каналів немає</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {channels.map((ch, i) => (
            <div key={ch.id}
              className="group bg-card border border-line rounded-card shadow-card p-4 space-y-3 animate-fadeInUp transition-[transform,box-shadow,border-color] duration-200 ease-tg hover:-translate-y-0.5 hover:shadow-lift hover:border-line-2"
              style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}>
              <div className="flex items-start gap-3">
                <Link to={`/channels/${ch.id}`} className="flex items-start gap-3 min-w-0 flex-1">
                  <Avatar
                    id={ch.username || ch.telegramId || String(ch.id)}
                    title={ch.title || ch.username || ""}
                    hasAvatar={dialogs.some((d) => ((ch.username && d.username === ch.username) || (ch.telegramId && d.id === ch.telegramId)) && d.hasAvatar)}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-sm truncate block group-hover:text-brand transition-colors">{ch.title || (ch.username ? `@${ch.username}` : "Приватний")}</span>
                    <span className="text-xs text-muted">{ch.username ? `@${ch.username}` : ch.telegramId || ""}</span>
                  </div>
                </Link>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(ch.id); }}
                  title="Видалити канал"
                  className="press flex items-center justify-center w-7 h-7 rounded-full text-faint hover:text-danger hover:bg-danger-soft opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0">
                  <Icon name="delete" size={16} />
                </button>
              </div>

              <div>
                <label className="flex items-center gap-1 text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                  <Icon name="adjust" size={12} /> Target
                </label>
                <TargetAutocomplete channel={ch} dialogs={dialogs} dialogsLoaded={dialogsLoaded} onSaved={load} />
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-line">
                <span className="flex items-center gap-1.5">
                  <span className="relative flex w-2 h-2">
                    {ch.active && <span className="absolute inline-flex w-full h-full rounded-full bg-success animate-pulseRing" />}
                    <span className={`relative inline-flex w-2 h-2 rounded-full ${ch.active ? "bg-success" : "bg-faint"}`} />
                  </span>
                  <span className={`text-xs font-medium ${ch.active ? "text-success" : "text-muted"}`}>
                    {ch.active ? "Активний" : "Неактивний"}
                  </span>
                </span>
                <span className="text-xs text-faint tabular-nums">{new Date(ch.createdAt).toLocaleDateString("uk-UA")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Subscriptions */}
      {showSubs && dialogsLoaded && (
        <div className="animate-fadeInUp">
          <div className="bg-card border border-line rounded-card shadow-card p-4 sm:p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2 className="text-sm font-semibold">Мої підписки <span className="text-muted font-normal">({dialogs.length})</span></h2>
              {selectedCount > 0 && (
                <button onClick={handleAddSelected} disabled={adding}
                  className="press flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-success text-white shadow-lift hover:brightness-105 disabled:opacity-60 animate-popIn">
                  <Icon name={adding ? "progress_activity" : "add"} size={14} className={adding ? "animate-spin" : ""} />
                  {adding ? "..." : `Додати (${selectedCount})`}
                </button>
              )}
            </div>

            <div className="relative mb-4">
              <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder="Фільтр..."
                className="w-full pl-10 pr-3 py-2.5 rounded-full bg-elev border border-line text-sm transition-all duration-200 ease-tg focus:outline-none focus:border-brand focus:bg-card focus:ring-4 focus:ring-brand/15" />
            </div>

            {filteredDialogs.length === 0 ? (
              <p className="text-muted text-sm py-6 text-center">Нічого не знайдено</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto scrollbar-thin -mx-1 px-1">
                {filteredDialogs.map((d, i) => {
                  const added = isAlreadyAdded(d);
                  const isSelected = selected.has(d.id);
                  return (
                    <div key={d.id} onClick={() => !added && toggleSelect(d.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 animate-fadeInUp ${
                        added ? "opacity-45" : isSelected ? "bg-brand-soft cursor-pointer" : "hover:bg-elev cursor-pointer"
                      }`}
                      style={{ animationDelay: `${Math.min(i * 18, 240)}ms` }}>
                      <input type="checkbox" checked={added || isSelected} disabled={added}
                        onChange={() => toggleSelect(d.id)} className="shrink-0 w-4 h-4 rounded accent-[rgb(var(--c-brand))]" />
                      <Avatar id={d.id} title={d.title} size="sm" hasAvatar={d.hasAvatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{d.title}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-px rounded-full shrink-0 ${d.isChannel ? "bg-brand-soft text-brand" : "bg-violet-soft text-violet"}`}>
                            {d.isChannel ? "Канал" : "Група"}
                          </span>
                        </div>
                        <div className="text-xs text-muted flex gap-2">
                          <span>{d.username ? `@${d.username}` : "Приватний"}</span>
                          {d.participantsCount != null && <span className="tabular-nums">{d.participantsCount.toLocaleString("uk-UA")}</span>}
                        </div>
                      </div>
                      {added && <span className="text-[10px] text-success font-semibold shrink-0">Додано</span>}
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
