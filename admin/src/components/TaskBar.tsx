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
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-fadeIn">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="space-y-1.5 pb-3">
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
    <div className="bg-white border border-neutral-200 shadow-lg overflow-hidden">
      {/* Progress bar */}
      <div className="h-0.5 bg-neutral-100">
        {isCollecting ? (
          <div className="h-full bg-blue-500 animate-pulse w-full" />
        ) : (
          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        {/* Icon */}
        <div className="shrink-0">
          {isCollecting ? (
            <Icon name="cloud_download" size={18} className="text-blue-600" />
          ) : (
            <Icon name="save" size={18} className="text-blue-600" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{t.channelLabel}</span>
          </div>
          <div className="text-xs text-neutral-400 tabular-nums">
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
          className="shrink-0 p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
