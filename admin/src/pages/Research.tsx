import { useEffect, useRef, useState, FormEvent } from "react";
import {
  startResearch,
  pollResearch,
  fetchTopicSuggestions,
  ResearchResult,
} from "../api";
import Icon from "../components/Icon";

const AGENT_ICONS: Record<string, string> = {
  планувальник: "checklist",
  розвідник: "travel_explore",
  "збирач ілюстрацій": "image",
  верифікатор: "verified",
  критик: "gavel",
  редактор: "edit_note",
};

const TIER_LABELS: Record<string, { text: string; cls: string }> = {
  free: { text: "вільна ліцензія", cls: "bg-emerald-50 text-emerald-700" },
  project: { text: "актив проєкту", cls: "bg-blue-50 text-blue-700" },
  docs: { text: "документація", cls: "bg-violet-50 text-violet-700" },
  unknown: { text: "невідома ліцензія", cls: "bg-neutral-100 text-neutral-500" },
};

export default function Research() {
  const [topic, setTopic] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<{ term: string; mentions: number }[]>([]);
  const [tab, setTab] = useState<"brief" | "facts" | "rejected" | "images" | "log">("brief");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    fetchTopicSuggestions()
      .then((s) => setSuggestions(s.slice(0, 12)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!taskId) return;
    timer.current = window.setInterval(async () => {
      try {
        const s = await pollResearch(taskId);
        setElapsed(s.elapsedMs);
        if (s.done) {
          if (timer.current) clearInterval(timer.current);
          setTaskId(null);
          if (s.error) setError(s.error);
          else if (s.result) setResult(s.result);
        }
      } catch (err: any) {
        if (timer.current) clearInterval(timer.current);
        setTaskId(null);
        setError(err.message);
      }
    }, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [taskId]);

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setError(""); setResult(null); setElapsed(0);
    try {
      const { taskId } = await startResearch(topic.trim());
      setTaskId(taskId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const running = taskId !== null;
  const total = result ? result.facts.length + result.rejected.length : 0;
  const rejectRate = total ? Math.round((result!.rejected.length / total) * 100) : 0;

  return (
    <div className="max-w-4xl space-y-5 animate-fadeIn">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Дослідження теми</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Команда агентів шукає джерела, читає їх і збирає факти. У бриф потрапляє лише
          те, для чого знайшлася дослівна цитата на реальній сторінці.
        </p>
      </div>

      <form onSubmit={handleRun} className="flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Наприклад: Model Context Protocol"
          disabled={running}
          className="flex-1 border border-neutral-200 px-3 py-2.5 text-sm focus:outline-none focus:border-neutral-900 transition-colors disabled:bg-neutral-50"
        />
        <button
          type="submit"
          disabled={running || !topic.trim()}
          className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          <Icon name={running ? "progress_activity" : "search"} size={16} className={running ? "animate-spin" : ""} />
          {running ? "Досліджую..." : "Запустити"}
        </button>
      </form>

      {suggestions.length > 0 && !result && !running && (
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Теми з вашого архіву
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.term}
                onClick={() => setTopic(s.term)}
                className="px-2.5 py-1 text-xs border border-neutral-200 text-neutral-600 hover:border-neutral-400 transition-colors"
              >
                {s.term} <span className="text-neutral-400">{s.mentions}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {running && (
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm px-3 py-2.5 border border-blue-200">
          <Icon name="progress_activity" size={16} className="animate-spin" />
          Агенти працюють, {Math.round(elapsed / 1000)} с. Зазвичай 2-5 хвилин. Сторінку можна закрити.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2.5 border border-red-200">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Перевірених фактів" value={result.facts.length} tone="good" />
            <Stat label="Відкинуто" value={`${result.rejected.length} (${rejectRate}%)`} tone="bad" />
            <Stat label="Джерел" value={result.sources.length} />
            <Stat label="Раундів" value={result.rounds} />
          </div>

          <div className="flex gap-0.5 border-b border-neutral-200 overflow-x-auto">
            {([
              ["brief", "Бриф"],
              ["facts", `Факти ${result.facts.length}`],
              ["rejected", `Відкинуті ${result.rejected.length}`],
              ["images", `Картинки ${result.images.length}`],
              ["log", "Агенти"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === key
                    ? "border-neutral-900 text-neutral-900"
                    : "border-transparent text-neutral-400 hover:text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "brief" && (
            <div className="bg-white border border-neutral-200 p-4">
              <pre className="whitespace-pre-wrap text-sm text-neutral-800 font-sans leading-relaxed">
                {result.brief}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(result.brief)}
                className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900"
              >
                <Icon name="content_copy" size={14} /> Скопіювати
              </button>
            </div>
          )}

          {tab === "facts" && (
            <div className="space-y-2">
              {result.facts.map((f, i) => (
                <div key={i} className="bg-white border border-neutral-200 p-3">
                  <div className="flex items-start gap-2">
                    <Icon name="check_circle" size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-900">{f.claim}</p>
                      <p className="text-xs text-neutral-500 mt-1.5 italic border-l-2 border-neutral-200 pl-2">
                        {f.quote}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <a href={f.url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate">
                          {f.url}
                        </a>
                        {f.confirmations > 1 && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5">
                            {f.confirmations} джерела
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "rejected" && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                Ці твердження не потрапили в бриф. Частина з них може бути правдою, але доказу не знайшлося.
              </p>
              {result.rejected.map((r, i) => (
                <div key={i} className="bg-white border border-neutral-200 p-3">
                  <div className="flex items-start gap-2">
                    <Icon name="cancel" size={16} className="text-red-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-700">{r.claim}</p>
                      <p className="text-xs text-red-600 mt-1">{r.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "images" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.images.map((img, i) => {
                const tier = TIER_LABELS[img.tier] || TIER_LABELS.unknown;
                return (
                  <div key={i} className="bg-white border border-neutral-200 p-3 space-y-2">
                    {img.hostedUrl ? (
                      <img src={img.hostedUrl} alt={img.alt} className="w-full h-36 object-cover" />
                    ) : (
                      <div className="w-full h-36 bg-neutral-50 flex items-center justify-center text-xs text-neutral-400 text-center px-3">
                        {img.skippedReason}
                      </div>
                    )}
                    <span className={`inline-block text-xs px-1.5 py-0.5 ${tier.cls}`}>{tier.text}</span>
                    <p className="text-xs text-neutral-500">{img.attribution}</p>
                    <a href={img.sourcePage} target="_blank" rel="noreferrer"
                      className="block text-xs text-blue-600 hover:underline truncate">
                      {img.sourcePage}
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "log" && (
            <div className="bg-white border border-neutral-200 divide-y divide-neutral-100">
              {result.transcript.map((t, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5">
                  <Icon name={AGENT_ICONS[t.agent] || "smart_toy"} size={16} className="text-neutral-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-neutral-900">{t.agent}</span>
                    <p className="text-xs text-neutral-600">{t.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.openQuestions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-1.5">
                Не з'ясовано
              </p>
              <ul className="list-disc list-inside text-sm text-amber-900 space-y-0.5">
                {result.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-neutral-900";
  return (
    <div className="bg-white border border-neutral-200 px-3 py-2.5">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
