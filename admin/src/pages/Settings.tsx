import { useEffect, useState, FormEvent } from "react";
import {
  fetchBotTokenStatus,
  saveBotToken,
  deleteBotToken,
  BotTokenStatus,
  fetchLinkedInStatus,
  saveLinkedInToken,
  setLinkedInEnabled,
  deleteLinkedIn,
  LinkedInStatus,
} from "../api";
import Icon from "../components/Icon";

const sectionClass = "bg-card border border-line rounded-card shadow-card p-4 sm:p-6 animate-fadeInUp";
const labelClass = "block text-[11px] font-semibold text-muted mb-1.5 uppercase tracking-wider";
const inputClass =
  "w-full rounded-xl border border-line bg-elev px-3.5 py-3 pr-11 text-sm font-mono transition-all duration-200 ease-tg focus:outline-none focus:border-brand focus:bg-card focus:ring-4 focus:ring-brand/15";
const primaryBtn =
  "press flex items-center gap-2 rounded-full brand-gradient text-white px-5 py-2.5 text-sm font-semibold shadow-brand hover:brightness-105 disabled:opacity-50";

function SectionHead({ icon, title, tone = "brand" }: { icon: string; title: string; tone?: "brand" | "info" }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className={`flex items-center justify-center w-9 h-9 rounded-xl ${tone === "info" ? "bg-info-soft text-info" : "bg-brand-soft text-brand"}`}>
        <Icon name={icon} size={20} />
      </span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function LinkedInSection() {
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    fetchLinkedInStatus().then(setStatus).catch((err) => setError(err.message));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true); setError(""); setInfo("");
    try {
      await saveLinkedInToken(token.trim());
      setStatus(await fetchLinkedInStatus());
      setToken("");
      setInfo("LinkedIn підключено");
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleToggle() {
    if (!status) return;
    setSaving(true); setError("");
    try { setStatus(await setLinkedInEnabled(!status.enabled)); }
    catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Відключити LinkedIn? Пости більше не будуть дублюватись у профіль.")) return;
    setSaving(true); setError(""); setInfo("");
    try { setStatus(await deleteLinkedIn()); setInfo("LinkedIn відключено"); }
    catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  const expiryHint = status?.connectedAt
    ? new Date(new Date(status.connectedAt).getTime() + 60 * 24 * 3600 * 1000).toLocaleDateString("uk-UA")
    : null;

  return (
    <section className={sectionClass} style={{ animationDelay: "80ms" }}>
      <SectionHead icon="share" title="LinkedIn крос-постинг" tone="info" />

      {status?.connected ? (
        <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-xl bg-success-soft text-sm animate-popIn">
          <div className="flex items-center gap-2 text-success min-w-0">
            <Icon name="check_circle" size={18} className="shrink-0" />
            <span className="truncate">
              {status.name || "Підключено"}
              {expiryHint && <span className="opacity-75"> · токен діє ~до {expiryHint}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={handleToggle} disabled={saving}
              className={`press flex items-center gap-1 text-xs font-semibold disabled:opacity-50 ${status.enabled ? "text-ink-2 hover:text-ink" : "text-success hover:brightness-110"}`}>
              <Icon name={status.enabled ? "pause" : "play_arrow"} size={16} />
              {status.enabled ? "Призупинити" : "Увімкнути"}
            </button>
            <button onClick={handleDelete} disabled={saving}
              className="press flex items-center gap-1 text-danger hover:brightness-110 text-xs font-semibold disabled:opacity-50">
              <Icon name="delete" size={16} /> Відключити
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-elev border border-line text-sm text-muted">
          <Icon name="info" size={18} className="shrink-0" /> LinkedIn не підключено — пости публікуються лише в Telegram і на сайт
        </div>
      )}

      {status?.connected && !status.enabled && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-warn-soft text-sm text-warn animate-popIn">
          <Icon name="pause_circle" size={18} className="shrink-0" /> Крос-постинг призупинено
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className={labelClass}>
            {status?.connected ? "Оновити access token" : "Access token"}
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="AQV..."
              autoComplete="off"
              className={inputClass}
            />
            <button type="button" onClick={() => setShowToken((v) => !v)}
              className="press absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-elev"
              aria-label={showToken ? "Hide" : "Show"}>
              <Icon name={showToken ? "visibility_off" : "visibility"} size={18} />
            </button>
          </div>
          <p className="text-xs text-muted mt-2">
            Токен буде зашифровано перед збереженням. Діє ~60 днів, потім згенеруйте новий.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm px-3 py-2 animate-popIn">
            <Icon name="error" size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {info && (
          <div className="flex items-start gap-2 rounded-xl bg-success-soft text-success text-sm px-3 py-2 animate-popIn">
            <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
            <span>{info}</span>
          </div>
        )}

        <button type="submit" disabled={saving || !token.trim()} className={primaryBtn}>
          <Icon name={saving ? "progress_activity" : "save"} size={16} className={saving ? "animate-spin" : ""} />
          Підключити
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-line text-xs text-muted space-y-2 leading-relaxed">
        <p className="font-semibold text-ink-2">Як отримати токен:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Створіть застосунок на <a href="https://developer.linkedin.com/" target="_blank" rel="noreferrer" className="text-brand hover:underline">developer.linkedin.com</a> (потрібна LinkedIn-сторінка компанії)</li>
          <li>У вкладці Products додайте <b className="text-ink-2">Share on LinkedIn</b> та <b className="text-ink-2">Sign In with LinkedIn using OpenID Connect</b></li>
          <li>У вкладці Auth відкрийте <b className="text-ink-2">OAuth 2.0 tools → Token generator</b>, виберіть scopes: <span className="font-mono">openid</span>, <span className="font-mono">profile</span>, <span className="font-mono">w_member_social</span> і згенеруйте токен під своїм акаунтом</li>
          <li>Вставте токен сюди і натисніть «Підключити»</li>
        </ol>
        <p>Пости публікуються у ваш особистий профіль: текст + фото (до 9), відео не підтримуються. Якщо пост є на сайті — додається посилання на повну версію.</p>
      </div>
    </section>
  );
}

export default function Settings() {
  const [status, setStatus] = useState<BotTokenStatus | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchBotTokenStatus();
      setStatus(data);
    } catch (err: any) {
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const data = await saveBotToken(token.trim());
      setStatus(data);
      setToken("");
      const handle = data.bot?.username ? `@${data.bot.username}` : data.bot?.firstName || "bot";
      setInfo(`Bot token saved — ${handle}`);
    } catch (err: any) {
      setError(err.message || "Failed to save token");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Видалити збережений bot token? Публікації без бота будуть без кнопок.")) return;
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const data = await deleteBotToken();
      setStatus(data);
      setInfo("Bot token видалено");
    } catch (err: any) {
      setError(err.message || "Failed to delete token");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Налаштування</h1>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          Токен бота використовується для публікації постів з inline-кнопками.
          Особистий акаунт не може додавати кнопки, тому потрібен окремий бот.
        </p>
      </div>

      <section className={sectionClass}>
        <SectionHead icon="smart_toy" title="Telegram Bot Token" />

        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-11 w-full rounded-xl" />
            <div className="skeleton h-11 w-full rounded-xl" />
            <div className="skeleton h-9 w-32 rounded-full" />
          </div>
        ) : (
          <>
            {status?.configured ? (
              <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-xl bg-success-soft text-sm animate-popIn">
                <div className="flex items-center gap-2 text-success min-w-0">
                  <Icon name="check_circle" size={18} className="shrink-0" />
                  <span className="font-mono text-xs truncate">{status.masked}</span>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="press flex items-center gap-1 text-danger hover:brightness-110 text-xs font-semibold disabled:opacity-50"
                >
                  <Icon name="delete" size={16} /> Видалити
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-elev border border-line text-sm text-muted">
                <Icon name="info" size={18} className="shrink-0" /> Токен ще не налаштовано
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className={labelClass}>
                  {status?.configured ? "Оновити токен" : "Новий токен"}
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="123456789:ABCdef..."
                    autoComplete="off"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="press absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-elev"
                    aria-label={showToken ? "Hide" : "Show"}
                  >
                    <Icon name={showToken ? "visibility_off" : "visibility"} size={18} />
                  </button>
                </div>
                <p className="text-xs text-muted mt-2">
                  Отримати у <span className="font-mono">@BotFather</span>. Токен буде зашифровано перед збереженням.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm px-3 py-2 animate-popIn">
                  <Icon name="error" size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {info && (
                <div className="flex items-start gap-2 rounded-xl bg-success-soft text-success text-sm px-3 py-2 animate-popIn">
                  <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
                  <span>{info}</span>
                </div>
              )}

              <button type="submit" disabled={saving || !token.trim()} className={primaryBtn}>
                <Icon name={saving ? "progress_activity" : "save"} size={16} className={saving ? "animate-spin" : ""} />
                Зберегти
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-line text-xs text-muted space-y-2 leading-relaxed">
              <p className="font-semibold text-ink-2">Як підключити:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Створи бота у <span className="font-mono">@BotFather</span> і скопіюй токен</li>
                <li>Додай бота адміном у цільовий канал з правом постити повідомлення</li>
                <li>Встав токен сюди і натисни «Зберегти»</li>
              </ol>
            </div>
          </>
        )}
      </section>

      <LinkedInSection />
    </div>
  );
}
