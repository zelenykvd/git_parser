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
    <section className="bg-white border border-neutral-200 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="share" size={20} className="text-sky-700" />
        <h2 className="text-sm font-semibold">LinkedIn крос-постинг</h2>
      </div>

      {status?.connected ? (
        <div className="flex items-center justify-between gap-3 mb-4 p-3 bg-green-50 border border-green-100 text-sm">
          <div className="flex items-center gap-2 text-green-700 min-w-0">
            <Icon name="check_circle" size={18} />
            <span className="truncate">
              {status.name || "Підключено"}
              {expiryHint && <span className="text-green-600/70"> · токен діє ~до {expiryHint}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={handleToggle} disabled={saving}
              className={`flex items-center gap-1 text-xs font-medium disabled:opacity-50 ${status.enabled ? "text-neutral-600 hover:text-neutral-800" : "text-emerald-600 hover:text-emerald-700"}`}>
              <Icon name={status.enabled ? "pause" : "play_arrow"} size={16} />
              {status.enabled ? "Призупинити" : "Увімкнути"}
            </button>
            <button onClick={handleDelete} disabled={saving}
              className="flex items-center gap-1 text-red-600 hover:text-red-700 text-xs font-medium disabled:opacity-50">
              <Icon name="delete" size={16} /> Відключити
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4 p-3 bg-neutral-50 border border-neutral-200 text-sm text-neutral-500">
          <Icon name="info" size={18} /> LinkedIn не підключено — пости публікуються лише в Telegram і на сайт
        </div>
      )}

      {status?.connected && !status.enabled && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 border border-amber-100 text-sm text-amber-700">
          <Icon name="pause_circle" size={18} /> Крос-постинг призупинено
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
            {status?.connected ? "Оновити access token" : "Access token"}
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="AQV..."
              autoComplete="off"
              className="w-full border border-neutral-200 px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-neutral-900 transition-colors"
            />
            <button type="button" onClick={() => setShowToken((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700"
              aria-label={showToken ? "Hide" : "Show"}>
              <Icon name={showToken ? "visibility_off" : "visibility"} size={18} />
            </button>
          </div>
          <p className="text-xs text-neutral-400 mt-1.5">
            Токен буде зашифровано перед збереженням. Діє ~60 днів, потім згенеруйте новий.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <Icon name="error" size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {info && (
          <div className="flex items-start gap-2 text-sm text-green-700">
            <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
            <span>{info}</span>
          </div>
        )}

        <button type="submit" disabled={saving || !token.trim()}
          className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors">
          {saving ? (
            <Icon name="progress_activity" size={16} className="animate-spin" />
          ) : (
            <Icon name="save" size={16} />
          )}
          Підключити
        </button>
      </form>

      <div className="mt-5 pt-4 border-t border-neutral-100 text-xs text-neutral-500 space-y-1.5">
        <p className="font-medium text-neutral-700">Як отримати токен:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Створіть застосунок на <a href="https://developer.linkedin.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">developer.linkedin.com</a> (потрібна LinkedIn-сторінка компанії)</li>
          <li>У вкладці Products додайте <b>Share on LinkedIn</b> та <b>Sign In with LinkedIn using OpenID Connect</b></li>
          <li>У вкладці Auth відкрийте <b>OAuth 2.0 tools → Token generator</b>, виберіть scopes: <span className="font-mono">openid</span>, <span className="font-mono">profile</span>, <span className="font-mono">w_member_social</span> і згенеруйте токен під своїм акаунтом</li>
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Налаштування</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Токен бота використовується для публікації постів з inline-кнопками.
          Особистий акаунт не може додавати кнопки, тому потрібен окремий бот.
        </p>
      </div>

      <section className="bg-white border border-neutral-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="smart_toy" size={20} className="text-blue-600" />
          <h2 className="text-sm font-semibold">Telegram Bot Token</h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Icon name="progress_activity" size={16} className="animate-spin" />
            Завантаження...
          </div>
        ) : (
          <>
            {status?.configured ? (
              <div className="flex items-center justify-between gap-3 mb-4 p-3 bg-green-50 border border-green-100 text-sm">
                <div className="flex items-center gap-2 text-green-700 min-w-0">
                  <Icon name="check_circle" size={18} />
                  <span className="font-mono text-xs truncate">{status.masked}</span>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-1 text-red-600 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                >
                  <Icon name="delete" size={16} /> Видалити
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 p-3 bg-neutral-50 border border-neutral-200 text-sm text-neutral-500">
                <Icon name="info" size={18} /> Токен ще не налаштовано
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5 uppercase tracking-wide">
                  {status?.configured ? "Оновити токен" : "Новий токен"}
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="123456789:ABCdef..."
                    autoComplete="off"
                    className="w-full border border-neutral-200 px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-neutral-900 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700"
                    aria-label={showToken ? "Hide" : "Show"}
                  >
                    <Icon name={showToken ? "visibility_off" : "visibility"} size={18} />
                  </button>
                </div>
                <p className="text-xs text-neutral-400 mt-1.5">
                  Отримати у <span className="font-mono">@BotFather</span>. Токен буде зашифровано перед збереженням.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600">
                  <Icon name="error" size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {info && (
                <div className="flex items-start gap-2 text-sm text-green-700">
                  <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
                  <span>{info}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !token.trim()}
                className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Icon name="progress_activity" size={16} className="animate-spin" />
                ) : (
                  <Icon name="save" size={16} />
                )}
                Зберегти
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-neutral-100 text-xs text-neutral-500 space-y-1.5">
              <p className="font-medium text-neutral-700">Як підключити:</p>
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
