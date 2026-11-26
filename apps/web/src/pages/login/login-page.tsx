import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.js";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { googleAuthUrl, login } from "@/lib/auth-api.js";
import { fieldErrors, getErrorMessage, loginSchema } from "@/lib/forms.js";
import { roleHome } from "@/lib/role-home.js";
import { useAuthStore } from "@/stores/auth-store.js";

export function LoginPage() {
  const navigate = useNavigate();
  const applyAuthResult = useAuthStore((state) => state.applyAuthResult);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await login(parsed.data);
      applyAuthResult(result);
      navigate(roleHome(result.user.role), { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setFormError(null);
    try {
      const { url } = await googleAuthUrl();
      window.location.assign(url);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Đăng nhập</h1>
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={errors.email}
      />
      <TextField
        id="password"
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        error={errors.password}
      />
      {formError ? <FormAlert message={formError} /> : null}
      <Button type="submit" disabled={busy}>Đăng nhập</Button>
      <Button type="button" variant="secondary" onClick={onGoogle}>
        Đăng nhập với Google
      </Button>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password">Quên mật khẩu?</Link>
        <Link to="/register">Tạo tài khoản</Link>
      </div>
    </form>
  );
}
