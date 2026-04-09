import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import Icon from "../components/Icon";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-sm bg-white border border-neutral-200 p-8 animate-fadeInUp">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Icon name="telegram" size={28} className="text-neutral-300" />
          <h1 className="text-lg font-semibold">TG Parser</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 transition-colors"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neutral-900 text-white py-2.5 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            {loading ? <Icon name="progress_activity" size={18} className="animate-spin" /> : "Увійти"}
          </button>
        </form>
      </div>
    </div>
  );
}
