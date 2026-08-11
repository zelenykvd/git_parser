import { useState, useRef, useEffect } from "react";
import { updateChannelTarget as apiUpdateChannelTarget } from "../api";
import Icon from "./Icon";
import Avatar from "./Avatar";

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

  useEffect(() => { setValue(channel.targetChannelId || ""); }, [channel.targetChannelId]);

  const filtered = dialogs
    .filter((d) => {
      if (!value.trim()) return true;
      const q = value.toLowerCase().replace(/^@/, "");
      return d.title.toLowerCase().includes(q) || (d.username && d.username.toLowerCase().includes(q)) || d.id.includes(q);
    })
    .slice(0, 8);

  async function save(val?: string) {
    const target = val !== undefined ? val : value;
    if (target === (channel.targetChannelId || "")) return;
    setSaving(true); setSaved(false);
    try {
      await apiUpdateChannelTarget(channel.id, target);
      setSaved(true); onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }

  function selectDialog(d: TelegramDialog) {
    const v = d.username ? `@${d.username}` : d.id;
    setValue(v); setOpen(false); setHighlightIndex(-1); save(v);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) { if (e.key === "Enter") save(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIndex((i) => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); highlightIndex >= 0 ? selectDialog(filtered[highlightIndex]) : (save(), setOpen(false)); }
    else if (e.key === "Escape") { setOpen(false); setHighlightIndex(-1); }
  }

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      (listRef.current.children[highlightIndex] as HTMLElement)?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  return (
    <div className="relative">
      <div className="relative">
        <Icon name="adjust" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); setOpen(dialogsLoaded); setHighlightIndex(-1); }}
          onFocus={() => { if (dialogsLoaded && dialogs.length > 0) setOpen(true); setHighlightIndex(-1); }}
          onBlur={() => { setOpen(false); setHighlightIndex(-1); save(); }}
          onKeyDown={handleKeyDown}
          placeholder="ID або @username"
          disabled={saving}
          className={`w-full pl-9 pr-9 py-2 rounded-xl border bg-elev text-sm transition-all duration-200 ease-tg focus:outline-none focus:bg-card focus:ring-4 focus:ring-brand/15 ${
            saved ? "border-success ring-4 ring-success/15" : "border-line focus:border-brand"
          }`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {saving && <Icon name="progress_activity" size={16} className="text-brand animate-spin" />}
          {saved && !saving && <Icon name="check" size={16} className="text-success animate-checkPop" />}
          {!saving && !saved && dialogsLoaded && <Icon name="expand_more" size={16} className="text-faint" />}
        </div>
      </div>

      {!dialogsLoaded && !value && (
        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted">
          <Icon name="info" size={14} />
          Завантажте підписки для автозаповнення
        </div>
      )}

      {open && dialogsLoaded && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-50 mt-1.5 w-full bg-card border border-line rounded-2xl shadow-pop max-h-56 overflow-y-auto scrollbar-thin p-1 animate-dropIn origin-top">
          {filtered.map((d, i) => (
            <div
              key={d.id}
              onMouseDown={(e) => { e.preventDefault(); selectDialog(d); }}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${i === highlightIndex ? "bg-brand-soft" : "hover:bg-elev"}`}
            >
              <Avatar id={d.id} title={d.title} size="sm" hasAvatar={d.hasAvatar} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">{d.title}</span>
                <span className="text-xs text-muted">{d.username ? `@${d.username}` : d.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
