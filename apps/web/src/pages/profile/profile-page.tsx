import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.js";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { getMe, updateMe } from "@/lib/auth-api.js";
import {
  changePasswordSchema,
  fieldErrors,
  getErrorMessage,
  profileSchema,
} from "@/lib/forms.js";
import { useAuthStore } from "@/stores/auth-store.js";

export function ProfilePage() {
  const navigate = useNavigate();
  const applyUser = useAuthStore((state) => state.applyUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getMe()
      .then((user) => {
        if (!active) return;
        setEmail(user.email);
        setDisplayName(user.displayName);
        applyUser(user);
      })
      .catch((err: unknown) => {
        if (active) setPageError(getErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [applyUser]);

  const onProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);
    const parsed = profileSchema.safeParse({ displayName });
    if (!parsed.success) {
      setProfileErrors(fieldErrors(parsed.error));
      return;
    }
    setProfileErrors({});
    try {
      const user = await updateMe({ displayName: parsed.data.displayName });
      setDisplayName(user.displayName);
      applyUser(user);
      setProfileSuccess(true);
    } catch (error) {
      setProfileError(getErrorMessage(error));
    }
  };

  const onPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword, confirmPassword });
    if (!parsed.success) {
      setPasswordErrors(fieldErrors(parsed.error));
      return;
    }
    setPasswordErrors({});
    try {
      await updateMe({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      // ASM-AUTH-003: password change revokes refresh tokens + bumps tokenVersion.
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      setPasswordError(getErrorMessage(error));
    }
  };

  if (pageError) {
    return <FormAlert message={pageError} />;
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Hồ sơ</h1>
      <p className="text-sm opacity-70">Email: {email}</p>
      <form onSubmit={onProfileSubmit} noValidate className="flex max-w-md flex-col gap-3">
        <h2 className="text-base font-medium">Thông tin cá nhân</h2>
        <TextField
          id="displayName"
          label="Tên hiển thị"
          value={displayName}
          onChange={setDisplayName}
          error={profileErrors.displayName}
        />
        {profileError ? <FormAlert message={profileError} /> : null}
        {profileSuccess ? <FormAlert tone="success" message="Cập nhật hồ sơ thành công." /> : null}
        <Button type="submit">Lưu thay đổi</Button>
      </form>
      <form onSubmit={onPasswordSubmit} noValidate className="flex max-w-md flex-col gap-3">
        <h2 className="text-base font-medium">Đổi mật khẩu</h2>
        <TextField
          id="currentPassword"
          label="Mật khẩu hiện tại"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          error={passwordErrors.currentPassword}
        />
        <TextField
          id="newPassword"
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          error={passwordErrors.newPassword}
        />
        <TextField
          id="confirmPassword"
          label="Xác nhận mật khẩu mới"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={passwordErrors.confirmPassword}
        />
        {passwordError ? <FormAlert message={passwordError} /> : null}
        <Button type="submit" variant="secondary">Đổi mật khẩu</Button>
      </form>
    </section>
  );
}
