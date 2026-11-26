import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.js";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { forgotPassword } from "@/lib/auth-api.js";
import { fieldErrors, forgotPasswordSchema, getErrorMessage } from "@/lib/forms.js";

// The API builds resetUrl from its own env (see D-AUTH-01). Re-point the token to
// this SPA's own /reset-password route so the clickable link always resolves here.
function toWebResetUrl(raw: string): string {
  const token = new URL(raw, window.location.origin).searchParams.get("token");
  return token ? `${window.location.origin}/reset-password?token=${token}` : raw;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setResetUrl(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await forgotPassword(parsed.data);
      setResetUrl(result.resetUrl ? toWebResetUrl(result.resetUrl) : null);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Quên mật khẩu</h1>
      <p className="text-sm opacity-70">
        Nhập email để lấy liên kết đặt lại mật khẩu (15 phút, dùng một lần). Chưa có email provider
        nên liên kết được hiển thị ngay tại đây.
      </p>
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={errors.email}
      />
      {formError ? <FormAlert message={formError} /> : null}
      {resetUrl ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">Liên kết đặt lại mật khẩu:</p>
          <a
            href={resetUrl}
            data-testid="reset-url"
            className="break-all text-sm text-blue-700 underline"
          >
            {resetUrl}
          </a>
        </div>
      ) : null}
      <Button type="submit" disabled={busy}>Gửi liên kết</Button>
      <p className="text-sm"><Link to="/login">Quay lại đăng nhập</Link></p>
    </form>
  );
}
