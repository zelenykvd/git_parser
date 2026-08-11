import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import Icon from "../components/Icon";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await login(username, password); navigate("/", { replace: true }); }
    catch (err: any) { setError(err.message || "Login failed"); }
    finally { setLoading(false); }
  }

  const inputClass =
    "w-full rounded-xl border border-line bg-elev px-3.5 py-3 text-sm transition-all duration-200 ease-tg focus:outline-none focus:border-brand focus:bg-card focus:ring-4 focus:ring-brand/15";

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg px-4 overflow-hidden">
      {/* Ambient Telegram-blue glow */}
      <div className="absolute inset-0 tg-canvas opacity-40 pointer-events-none" />
      <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-brand-2/25 blur-3xl animate-floatSlow pointer-events-none" />
      <div
        className="absolute -bottom-28 -right-10 w-96 h-96 rounded-full bg-brand-3/20 blur-3xl animate-floatSlow pointer-events-none"
        style={{ animationDelay: "-7s" }}
      />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm glass border border-line rounded-3xl shadow-pop p-7 sm:p-9 animate-fadeInUp">
        <div className="flex flex-col items-center gap-3 mb-8">
          <span className="brand-gradient inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-brand">
            <Icon name="send" size={30} className="text-white -ml-0.5" filled />
          </span>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight">TG Parser</h1>
            <p className="text-xs text-muted mt-0.5">Панель адміністратора</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-muted mb-1.5 uppercase tracking-wider">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className={inputClass} required />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted mb-1.5 uppercase tracking-wider">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className={inputClass} required />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 rounded-xl bg-danger-soft text-danger text-sm px-3 py-2 animate-popIn">
              <Icon name="error" size={16} /> {error}
            </p>
          )}
          <button type="submit" disabled={loading}
            className="press w-full flex items-center justify-center gap-2 rounded-xl brand-gradient text-white py-3 text-sm font-semibold shadow-brand hover:brightness-105 disabled:opacity-60">
            {loading ? <Icon name="progress_activity" size={18} className="animate-spin" /> : <><Icon name="login" size={18} /> Увійти</>}
          </button>
        </form>
      </div>
    </div>
  );
}
