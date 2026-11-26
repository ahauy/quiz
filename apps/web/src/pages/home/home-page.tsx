import { Link, useNavigate } from "react-router-dom";
import { Role } from "@quiz/shared";
import { Button } from "@/components/ui/button.js";
import { useAuthStore } from "@/stores/auth-store.js";

export function HomePage() {
  const userId = useAuthStore((state) => state.userId);
  const role = useAuthStore((state) => state.role);
  const navigate = useNavigate();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Web thi trắc nghiệm</h1>
      <p className="text-sm opacity-70">Nền tảng thi trắc nghiệm cho giáo viên và học sinh.</p>
      {!userId ? (
        <div className="flex gap-2">
          <Button onClick={() => navigate("/login")}>Đăng nhập</Button>
          <Button variant="secondary" onClick={() => navigate("/register")}>Đăng ký</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/profile")}>Hồ sơ</Button>
          {role === Role.TEACHER ? (
            <Button variant="secondary" onClick={() => navigate("/teacher")}>
              Khu vực giáo viên
            </Button>
          ) : null}
          {role === Role.STUDENT ? (
            <Button variant="secondary" onClick={() => navigate("/student")}>
              Khu vực học sinh
            </Button>
          ) : null}
        </div>
      )}
      <p className="text-sm">
        <Link to="/forgot-password">Quên mật khẩu?</Link>
      </p>
    </section>
  );
}
