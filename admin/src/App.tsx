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

function LogoutButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        clearToken();
        navigate("/login", { replace: true });
      }}
      className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
    >
      Вийти
    </button>
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
                <nav className="bg-white shadow">
                  <div className="max-w-7xl mx-auto px-4">
                    <div className="flex h-14 items-center gap-8">
                      <span className="font-bold text-lg">TG Parser</span>
                      <NavLink
                        to="/"
                        className={({ isActive }) =>
                          `text-sm font-medium ${isActive ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-600 hover:text-gray-900"} pb-0.5`
                        }
                        end
                      >
                        Пости
                      </NavLink>
                      <NavLink
                        to="/channels"
                        className={({ isActive }) =>
                          `text-sm font-medium ${isActive ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-600 hover:text-gray-900"} pb-0.5`
                        }
                      >
                        Канали
                      </NavLink>
                      <LogoutButton />
                    </div>
                  </div>
                </nav>

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
