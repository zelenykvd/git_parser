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
  free: { text: "вільна ліцензія", cls: "bg-success-soft text-success" },
  project: { text: "актив проєкту", cls: "bg-brand-soft text-brand" },
  docs: { text: "документація", cls: "bg-violet-soft text-violet" },
  unknown: { text: "невідома ліцензія", cls: "bg-elev text-muted" },
};

const cardClass = "bg-card border border-line rounded-card shadow-card";

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
    <div className="max-w-4xl space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-brand-soft text-brand shrink-0">
          <Icon name="travel_explore" size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Дослідження теми</h1>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            Команда агентів шукає джерела, читає їх і збирає факти. У бриф потрапляє лише
            те, для чого знайшлася дослівна цитата на реальній сторінці.
          </p>
        </div>
      </div>

      <form onSubmit={handleRun} className="flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Наприклад: Model Context Protocol"
          disabled={running}
          className="flex-1 rounded-full border border-line bg-elev px-4 py-3 text-sm transition-all duration-200 ease-tg focus:outline-none focus:border-brand focus:bg-card focus:ring-4 focus:ring-brand/15 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={running || !topic.trim()}
          className="press flex items-center gap-2 rounded-full brand-gradient text-white px-5 py-3 text-sm font-semibold shadow-brand hover:brightness-105 disabled:opacity-50"
        >
          <Icon name={running ? "progress_activity" : "search"} size={16} className={running ? "animate-spin" : ""} />
          {running ? "Досліджую..." : "Запустити"}
        </button>
      </form>

      {suggestions.length > 0 && !result && !running && (
        <div className="animate-fadeInUp">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
            Теми з вашого архіву
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={s.term}
                onClick={() => setTopic(s.term)}
                className="press px-3 py-1.5 rounded-full text-xs font-medium bg-card border border-line text-ink-2 hover:border-brand hover:text-brand animate-fadeInUp"
                style={{ animationDelay: `${Math.min(i * 25, 250)}ms` }}
              >
                {s.term} <span className="text-faint tabular-nums">{s.mentions}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {running && (
        <div className={`${cardClass} overflow-hidden animate-fadeInUp`}>
          <div className="h-1 barber" />
          <div className="flex items-center gap-2.5 px-4 py-3 text-sm text-ink-2">
            <Icon name="progress_activity" size={18} className="animate-spin text-brand shrink-0" />
            <span>Агенти працюють, <span className="tabular-nums font-medium">{Math.round(elapsed / 1000)} с</span>. Зазвичай 2-5 хвилин. Сторінку можна закрити.</span>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm px-3.5 py-2.5 animate-popIn">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat label="Перевірених фактів" value={result.facts.length} tone="good" delay={0} />
            <Stat label="Відкинуто" value={`${result.rejected.length} (${rejectRate}%)`} tone="bad" delay={60} />
            <Stat label="Джерел" value={result.sources.length} delay={120} />
            <Stat label="Раундів" value={result.rounds} delay={180} />
          </div>

          <div className="flex gap-1 border-b border-line overflow-x-auto scrollbar-thin">
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
                className={`relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === key ? "text-brand" : "text-muted hover:text-ink"
                }`}
              >
                {label}
                {tab === key && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full brand-gradient animate-fadeIn" />
                )}
              </button>
            ))}
          </div>

          <div key={tab} className="animate-fadeInUp">
            {tab === "brief" && (
              <div className={`${cardClass} p-4 sm:p-5`}>
                <pre className="whitespace-pre-wrap text-sm text-ink font-sans leading-relaxed">
                  {result.brief}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(result.brief)}
                  className="press mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted hover:text-brand hover:bg-brand-soft"
                >
                  <Icon name="content_copy" size={14} /> Скопіювати
                </button>
              </div>
            )}

            {tab === "facts" && (
              <div className="space-y-2.5">
                {result.facts.map((f, i) => (
                  <div key={i} className={`${cardClass} p-3.5 animate-fadeInUp`} style={{ animationDelay: `${Math.min(i * 35, 280)}ms` }}>
                    <div className="flex items-start gap-2.5">
                      <Icon name="check_circle" size={16} className="text-success mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-ink leading-relaxed">{f.claim}</p>
                        <p className="text-xs text-muted mt-2 italic border-l-2 border-brand/40 pl-2.5 leading-relaxed">
                          {f.quote}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <a href={f.url} target="_blank" rel="noreferrer"
                            className="text-xs text-brand hover:underline truncate">
                            {f.url}
                          </a>
                          {f.confirmations > 1 && (
                            <span className="text-xs bg-success-soft text-success px-2 py-0.5 rounded-full shrink-0">
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
              <div className="space-y-2.5">
                <p className="text-xs text-muted leading-relaxed">
                  Ці твердження не потрапили в бриф. Частина з них може бути правдою, але доказу не знайшлося.
                </p>
                {result.rejected.map((r, i) => (
                  <div key={i} className={`${cardClass} p-3.5 animate-fadeInUp`} style={{ animationDelay: `${Math.min(i * 35, 280)}ms` }}>
                    <div className="flex items-start gap-2.5">
                      <Icon name="cancel" size={16} className="text-danger mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-ink-2 leading-relaxed">{r.claim}</p>
                        <p className="text-xs text-danger mt-1">{r.reason}</p>
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
                    <div key={i} className={`${cardClass} p-3 space-y-2.5 animate-fadeInUp`} style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}>
                      {img.hostedUrl ? (
                        <img src={img.hostedUrl} alt={img.alt} className="w-full h-36 object-cover rounded-xl bg-elev" />
                      ) : (
                        <div className="w-full h-36 rounded-xl bg-elev flex items-center justify-center text-xs text-muted text-center px-3">
                          {img.skippedReason}
                        </div>
                      )}
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${tier.cls}`}>{tier.text}</span>
                      <p className="text-xs text-muted">{img.attribution}</p>
                      <a href={img.sourcePage} target="_blank" rel="noreferrer"
                        className="block text-xs text-brand hover:underline truncate">
                        {img.sourcePage}
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "log" && (
              <div className={`${cardClass} overflow-hidden`}>
                {result.transcript.map((t, i) => (
                  <div key={i}
                    className="flex items-start gap-3 p-3 border-b border-line last:border-0 animate-fadeInUp"
                    style={{ animationDelay: `${Math.min(i * 25, 300)}ms` }}>
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-elev text-brand shrink-0">
                      <Icon name={AGENT_ICONS[t.agent] || "smart_toy"} size={15} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <span className="text-xs font-semibold text-ink">{t.agent}</span>
                      <p className="text-xs text-ink-2 leading-relaxed">{t.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.openQuestions.length > 0 && (
            <div className="rounded-card bg-warn-soft border border-warn/25 p-4">
              <p className="text-[11px] font-semibold text-warn uppercase tracking-wider mb-2">
                Не з'ясовано
              </p>
              <ul className="list-disc list-inside text-sm text-ink-2 space-y-1">
                {result.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, delay = 0 }: { label: string; value: string | number; tone?: "good" | "bad"; delay?: number }) {
  const color = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink";
  return (
    <div className={`${cardClass} px-3.5 py-3 animate-fadeInUp`} style={{ animationDelay: `${delay}ms` }}>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}
