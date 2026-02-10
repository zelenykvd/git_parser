import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import PostList from "./pages/PostList";
import PostDetail from "./pages/PostDetail";
import Channels from "./pages/Channels";
import ChannelDetail from "./pages/ChannelDetail";
import Login from "./pages/Login";
import { isLoggedIn, clearToken } from "./auth";

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function NavBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  // Close mobile menu on navigation
  const handleNavClick = () => setMenuOpen(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium ${isActive ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-600 hover:text-gray-900"} pb-0.5`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-md text-sm font-medium ${isActive ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`;

  return (
    <nav className="bg-white shadow relative">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg">TG Parser</span>
            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-6">
              <NavLink to="/" className={linkClass} end>
                Пости
              </NavLink>
              <NavLink to="/channels" className={linkClass}>
                Канали
              </NavLink>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Desktop logout */}
            <button
              onClick={() => {
                clearToken();
                navigate("/login", { replace: true });
              }}
              className="hidden md:block text-sm text-gray-500 hover:text-gray-700"
            >
              Вийти
            </button>
            {/* Mobile burger button */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              aria-label="Меню"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          <NavLink to="/" className={mobileLinkClass} end onClick={handleNavClick}>
            Пости
          </NavLink>
          <NavLink to="/channels" className={mobileLinkClass} onClick={handleNavClick}>
            Канали
          </NavLink>
          <button
            onClick={() => {
              clearToken();
              navigate("/login", { replace: true });
            }}
            className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          >
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

                <main className="max-w-7xl mx-auto px-4 py-6">
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
