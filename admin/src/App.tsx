import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import PostList from "./pages/PostList";
import PostDetail from "./pages/PostDetail";
import Channels from "./pages/Channels";
import ChannelDetail from "./pages/ChannelDetail";
import Settings from "./pages/Settings";
import Research from "./pages/Research";
import Login from "./pages/Login";
import { isLoggedIn, clearToken } from "./auth";
import Icon from "./components/Icon";
import TaskBar from "./components/TaskBar";
import ThemeToggle from "./components/ThemeToggle";

const NAV = [
  { to: "/", icon: "article", label: "Пости", end: true },
  { to: "/channels", icon: "rss_feed", label: "Канали" },
  { to: "/research", icon: "travel_explore", label: "Дослідження" },
  { to: "/settings", icon: "settings", label: "Налаштування" },
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="brand-gradient inline-flex items-center justify-center rounded-xl shadow-brand shrink-0"
      style={{ width: size, height: size }}
    >
      <Icon name="send" size={size * 0.6} className="text-white -ml-px" filled />
    </span>
  );
}

function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const handleNavClick = () => setMenuOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `press relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
      isActive
        ? "text-brand bg-brand-soft"
        : "text-muted hover:text-ink hover:bg-elev"
    }`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 mx-2 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
      isActive ? "text-brand bg-brand-soft" : "text-ink-2 hover:bg-elev"
    }`;

  return (
    <nav className="glass border-b border-line sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-semibold text-[15px] tracking-tight">TG Parser</span>
            <div className="hidden md:flex items-center ml-6 gap-1">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass} end={item.end}>
                  <Icon name={item.icon} size={18} /> {item.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={() => { clearToken(); navigate("/login", { replace: true }); }}
              title="Вийти"
              aria-label="Вийти"
              className="press hidden md:flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-danger hover:bg-danger-soft">
              <Icon name="logout" size={20} />
            </button>
            <button onClick={() => setMenuOpen((v) => !v)}
              className="press md:hidden flex items-center justify-center w-9 h-9 -mr-1.5 rounded-full text-muted hover:text-ink hover:bg-elev"
              aria-label="Menu">
              <Icon key={menuOpen ? "close" : "menu"} name={menuOpen ? "close" : "menu"} size={24} className="animate-popIn" />
            </button>
          </div>
        </div>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-line bg-card/95 pb-2 pt-2 space-y-0.5 animate-dropIn origin-top">
          {NAV.map((item, i) => (
            <div key={item.to} className="animate-fadeInUp" style={{ animationDelay: `${i * 35}ms` }}>
              <NavLink to={item.to} className={mobileLinkClass} end={item.end} onClick={handleNavClick}>
                <Icon name={item.icon} size={20} /> {item.label}
              </NavLink>
            </div>
          ))}
          <button onClick={() => { clearToken(); navigate("/login", { replace: true }); }}
            className="flex items-center gap-3 w-[calc(100%-1rem)] mx-2 px-3 py-3 rounded-xl text-sm font-medium text-danger hover:bg-danger-soft transition-colors animate-fadeInUp"
            style={{ animationDelay: `${NAV.length * 35}ms` }}>
            <Icon name="logout" size={20} /> Вийти
          </button>
        </div>
      )}
    </nav>
  );
}

/** Re-keyed on every navigation so each page plays its entrance animation. */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-routeIn">
      <Routes location={location}>
        <Route path="/" element={<PostList />} />
        <Route path="/posts/:id" element={<PostDetail />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/channels/:id" element={<ChannelDetail />} />
        <Route path="/research" element={<Research />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={
          <AuthGuard>
            <div className="min-h-screen bg-bg pb-16">
              <NavBar />
              <TaskBar />
              <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-7">
                <AnimatedRoutes />
              </main>
            </div>
          </AuthGuard>
        } />
      </Routes>
    </BrowserRouter>
  );
}
