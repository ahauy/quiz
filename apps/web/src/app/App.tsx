import { Link, useNavigate } from "react-router-dom";
import { Role } from "@quiz/shared";
import { Button } from "@/components/ui/button.js";
import { logout } from "@/lib/auth-api.js";
import { useAuthStore } from "@/stores/auth-store.js";
import { AuthBootstrap } from "./auth-bootstrap.js";
import { AppRoutes } from "./router.js";

function Header() {
  const userId = useAuthStore((state) => state.userId);
  const role = useAuthStore((state) => state.role);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();

  const onLogout = async () => {
    try {
      await logout();
    } catch (error) {
      // Even if the server is unreachable, drop the local session immediately.
      console.warn("Logout request failed; clearing local session", error);
    }
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <header className="border-b border-gray-300">
      <nav className="mx-auto flex max-w-2xl flex-wrap items-center gap-4 p-4 text-sm">
        <Link to="/" className="font-semibold">Quiz</Link>
        {userId ? null : <Link to="/login">Đăng nhập</Link>}
        {userId ? null : <Link to="/register">Đăng ký</Link>}
        {userId ? <Link to="/profile">Hồ sơ</Link> : null}
        {role === Role.TEACHER ? <Link to="/teacher">Giáo viên</Link> : null}
        {role === Role.TEACHER ? <Link to="/teacher/classrooms">Lớp học</Link> : null}
        {role === Role.STUDENT ? <Link to="/student">Học sinh</Link> : null}
        {role === Role.STUDENT ? <Link to="/student/classrooms">Lớp học</Link> : null}
        {role === Role.STUDENT ? <Link to="/student/join">Tham gia lớp</Link> : null}
        {userId ? (
          <Button variant="secondary" onClick={onLogout}>Đăng xuất</Button>
        ) : null}
      </nav>
    </header>
  );
}

export function App() {
  return (
    <AuthBootstrap>
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto max-w-2xl p-8">
          <AppRoutes />
        </main>
      </div>
    </AuthBootstrap>
  );
}
