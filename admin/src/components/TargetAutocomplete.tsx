import { useState, useRef, useEffect } from "react";
import { updateChannelTarget as apiUpdateChannelTarget, telegramAvatarUrl } from "../api";
import { Target, Check, Loader2, ChevronDown, Info } from "lucide-react";

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
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-500",
  "bg-teal-500", "bg-blue-500", "bg-indigo-500", "bg-purple-500", "bg-pink-500",
];

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function MiniAvatar({ id, title, hasAvatar = true }: { id: string; title: string; hasAvatar?: boolean }) {
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
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${hashColor(id)}`}>
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className="w-6 h-6 rounded-full object-cover shrink-0"
    />
  );
}

interface Props {
  channel: Channel;
  dialogs: TelegramDialog[];
  dialogsLoaded: boolean;
  onSaved: () => void;
}

export default function TargetAutocomplete({ channel, dialogs, dialogsLoaded, onSaved }: Props) {
  const [value, setValue] = useState(channel.targetChannelId || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(channel.targetChannelId || "");
  }, [channel.targetChannelId]);

  const filtered = dialogs
    .filter((d) => {
      if (!value.trim()) return true;
      const q = value.toLowerCase().replace(/^@/, "");
      return (
        d.title.toLowerCase().includes(q) ||
        (d.username && d.username.toLowerCase().includes(q)) ||
        d.id.includes(q)
      );
    })
    .slice(0, 8);

  async function save(val?: string) {
    const target = val !== undefined ? val : value;
    if (target === (channel.targetChannelId || "")) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiUpdateChannelTarget(channel.id, target);
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  }

  function selectDialog(d: TelegramDialog) {
    const newValue = d.username ? `@${d.username}` : d.id;
    setValue(newValue);
    setOpen(false);
    setHighlightIndex(-1);
    save(newValue);
  }

  function handleFocus() {
    if (dialogsLoaded && dialogs.length > 0) {
      setOpen(true);
    }
    setHighlightIndex(-1);
  }

  function handleBlur() {
    setOpen(false);
    setHighlightIndex(-1);
    save();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) {
      if (e.key === "Enter") save();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        selectDialog(filtered[highlightIndex]);
      } else {
        save();
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIndex(-1);
    }
  }

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const showHint = !dialogsLoaded && !value;

  return (
    <div className="relative">
      <div className="relative">
        <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); setOpen(dialogsLoaded); setHighlightIndex(-1); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="ID або @username"
          disabled={saving}
          className={`w-full pl-9 pr-10 py-2 text-sm border rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            saved ? "border-green-500 bg-green-50" : "border-gray-300"
          }`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {saving && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          )}
          {saved && !saving && (
            <Check className="w-4 h-4 text-green-600 animate-checkPop" />
          )}
          {!saving && !saved && dialogsLoaded && dialogs.length > 0 && (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {showHint && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Завантажте підписки для автозаповнення</span>
        </div>
      )}

      {open && dialogsLoaded && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto scrollbar-thin animate-fadeIn"
        >
          {filtered.map((d, i) => (
            <div
              key={d.id}
              onMouseDown={(e) => {
                e.preventDefault();
                selectDialog(d);
              }}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                i === highlightIndex ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <MiniAvatar id={d.id} title={d.title} hasAvatar={d.hasAvatar} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{d.title}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    d.isChannel ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}>
                    {d.isChannel ? "Канал" : "Група"}
                  </span>
                </div>
                <div className="text-xs text-gray-400 flex gap-2">
                  <span>{d.username ? `@${d.username}` : `ID: ${d.id}`}</span>
                  {d.participantsCount != null && (
                    <span>{d.participantsCount.toLocaleString("uk-UA")}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
