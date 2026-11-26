import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormAlert } from "@/components/ui/field.js";
import { googleCallback } from "@/lib/auth-api.js";
import { getErrorMessage } from "@/lib/forms.js";
import { takeOAuthTeacherCode } from "@/lib/oauth-teacher-code.js";
import { roleHome } from "@/lib/role-home.js";
import { useAuthStore } from "@/stores/auth-store.js";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const applyAuthResult = useAuthStore((state) => state.applyAuthResult);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      setError("Thiếu mã xác thực hoặc state từ Google.");
      return;
    }
    const teacherCode = takeOAuthTeacherCode();
    const body = teacherCode ? { code, state, teacherCode } : { code, state };
    void googleCallback(body)
      .then((result) => {
        applyAuthResult(result);
        navigate(roleHome(result.user.role), { replace: true });
      })
      .catch((err: unknown) => setError(getErrorMessage(err)));
  }, [searchParams, navigate, applyAuthResult]);

  if (error) {
    return (
      <section className="flex max-w-md flex-col gap-3">
        <h1 className="text-xl font-semibold">Đăng nhập Google</h1>
        <FormAlert message={error} />
        <Link to="/login" className="text-sm text-blue-700 underline">
          Quay lại đăng nhập
        </Link>
      </section>
    );
  }

  return <p role="status" aria-live="polite">Đang xử lý đăng nhập Google…</p>;
}
