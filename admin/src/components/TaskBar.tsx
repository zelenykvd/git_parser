import { useEffect, useState } from "react";
import { fetchAllTasks, cancelFetchHistory } from "../api";
import Icon from "./Icon";

interface Task {
  channelId: number;
  channelLabel: string;
  fetched: number;
  saved: number;
  skipped: number;
  done: boolean;
  error?: string;
  phase?: "collecting" | "saving";
}

export default function TaskBar() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await fetchAllTasks();
        if (active) setTasks(data);
      } catch {}
      if (active) setTimeout(poll, 2000);
    }
    poll();
    return () => { active = false; };
  }, []);

  const visible = tasks.filter((t) => !dismissed.has(t.channelId));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="space-y-2 pb-4">
          {visible.map((t) => (
            <TaskItem
              key={t.channelId}
              task={t}
              onCancel={async () => {
                await cancelFetchHistory(t.channelId).catch(() => {});
                setDismissed((s) => new Set(s).add(t.channelId));
              }}
              onDismiss={() => setDismissed((s) => new Set(s).add(t.channelId))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskItem({ task: t, onCancel, onDismiss }: { task: Task; onCancel: () => void; onDismiss: () => void }) {
  const isCollecting = t.phase === "collecting" || (!t.phase && t.saved === 0);
  const total = t.fetched || 1;
  const progressPct = isCollecting ? 0 : Math.round((t.saved / total) * 100);

  return (
    <div className="glass pointer-events-auto border border-line rounded-2xl shadow-pop overflow-hidden animate-slideUp">
      {/* Progress bar */}
      <div className="h-1 bg-line">
        {isCollecting ? (
          <div className="h-full barber w-full" />
        ) : (
          <div className="h-full brand-gradient transition-[width] duration-500 ease-tg" style={{ width: `${progressPct}%` }} />
        )}
      </div>

      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Icon */}
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-soft text-brand shrink-0">
          <Icon name={isCollecting ? "cloud_download" : "save"} size={18} />
        </span>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{t.channelLabel}</span>
          </div>
          <div className="text-xs text-muted tabular-nums">
            {isCollecting ? (
              <span>Збір повідомлень... {t.fetched}</span>
            ) : (
              <span>Збереження {t.saved} з {t.fetched} ({progressPct}%)</span>
            )}
          </div>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          title="Скасувати"
          className="press shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-danger hover:bg-danger-soft"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
