import { useEffect, useState, FormEvent } from "react";
import {
  fetchBotTokenStatus,
  saveBotToken,
  deleteBotToken,
  BotTokenStatus,
} from "../api";
import Icon from "../components/Icon";

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
    </div>
  );
}
