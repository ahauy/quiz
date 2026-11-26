import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button.js";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { resetPassword } from "@/lib/auth-api.js";
import { fieldErrors, getErrorMessage, resetPasswordSchema } from "@/lib/forms.js";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = resetPasswordSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await resetPassword(parsed.data);
      setSuccess(true);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Đặt lại mật khẩu</h1>
      {!token ? <FormAlert message="Liên kết đặt lại không hợp lệ hoặc thiếu mã. Hãy yêu cầu liên kết mới." /> : null}
      <TextField
        id="newPassword"
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        error={errors.newPassword}
      />
      {errors.token ? <FormAlert message={errors.token} /> : null}
      {formError ? <FormAlert message={formError} /> : null}
      {success ? (
        <FormAlert tone="success" message="Đổi mật khẩu thành công. Hãy đăng nhập lại." />
      ) : null}
      <Button type="submit" disabled={busy || !token}>Đặt lại mật khẩu</Button>
      <p className="text-sm"><Link to="/login">Đăng nhập</Link></p>
    </form>
  );
}
