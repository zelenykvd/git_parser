import { useEffect, useState } from "react";
import { fetchAllTasks, cancelFetchHistory } from "../api";
import Icon from "./Icon";

interface Task {
  channelId: number;
  channelLabel: string;
  fetched: number;
  saved: number;
  done: boolean;
  error?: string;
}

export default function TaskBar() {
  const [tasks, setTasks] = useState<Task[]>([]);

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

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200 shadow-lg animate-fadeIn">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        {tasks.map((t) => (
          <div key={t.channelId} className="flex items-center gap-3 py-2.5 text-sm">
            <Icon name="download" size={16} className="text-blue-600 animate-pulse shrink-0" />
            <span className="truncate text-neutral-600 min-w-0">
              {t.channelLabel}
            </span>
            <span className="text-xs text-neutral-400 tabular-nums whitespace-nowrap">
              {t.fetched} / {t.saved} збережено
            </span>
            <div className="flex-1" />
            <button
              onClick={async () => {
                await cancelFetchHistory(t.channelId).catch(() => {});
                setTasks((prev) => prev.filter((x) => x.channelId !== t.channelId));
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors shrink-0"
            >
              <Icon name="stop" size={14} /> Стоп
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
