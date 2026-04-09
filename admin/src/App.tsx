import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import PostList from "./pages/PostList";
import PostDetail from "./pages/PostDetail";
import Channels from "./pages/Channels";
import ChannelDetail from "./pages/ChannelDetail";
import Login from "./pages/Login";
import { isLoggedIn, clearToken } from "./auth";
import Icon from "./components/Icon";

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleNavClick = () => setMenuOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? "text-neutral-900 bg-neutral-100"
        : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
    }`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b border-neutral-100 transition-colors ${
      isActive ? "text-neutral-900 bg-neutral-50" : "text-neutral-500"
    }`;

  return (
    <nav className="bg-white border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-1">
            <Icon name="telegram" size={22} className="text-neutral-400" />
            <span className="font-semibold text-sm tracking-tight">TG Parser</span>

            <div className="hidden md:flex items-center ml-6 gap-0.5">
              <NavLink to="/" className={linkClass} end>
                <Icon name="article" size={18} />
                Пости
              </NavLink>
              <NavLink to="/channels" className={linkClass}>
                <Icon name="rss_feed" size={18} />
                Канали
              </NavLink>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { clearToken(); navigate("/login", { replace: true }); }}
              className="hidden md:flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <Icon name="logout" size={18} />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden p-1.5 text-neutral-500 hover:text-neutral-900 transition-colors"
              aria-label="Menu"
            >
              <Icon name={menuOpen ? "close" : "menu"} size={22} />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white animate-fadeIn">
          <NavLink to="/" className={mobileLinkClass} end onClick={handleNavClick}>
            <Icon name="article" size={20} />
            Пости
          </NavLink>
          <NavLink to="/channels" className={mobileLinkClass} onClick={handleNavClick}>
            <Icon name="rss_feed" size={20} />
            Канали
          </NavLink>
          <button
            onClick={() => { clearToken(); navigate("/login", { replace: true }); }}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-neutral-400 hover:text-neutral-600"
          >
            <Icon name="logout" size={20} />
            Вийти
          </button>
        </div>
      )}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <AuthGuard>
              <div className="min-h-screen">
                <NavBar />
                <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                  <Routes>
                    <Route path="/" element={<PostList />} />
                    <Route path="/posts/:id" element={<PostDetail />} />
                    <Route path="/channels" element={<Channels />} />
                    <Route path="/channels/:id" element={<ChannelDetail />} />
                  </Routes>
                </main>
              </div>
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
