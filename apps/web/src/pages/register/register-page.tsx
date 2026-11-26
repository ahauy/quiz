import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Role, type RegisterDto } from "@quiz/shared";
import { Button } from "@/components/ui/button.js";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { googleAuthUrl, register } from "@/lib/auth-api.js";
import { fieldErrors, getErrorMessage, registerSchema } from "@/lib/forms.js";
import { saveOAuthTeacherCode } from "@/lib/oauth-teacher-code.js";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [requestedRole, setRequestedRole] = useState<Role>(Role.STUDENT);
  const [teacherCode, setTeacherCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const parsed = registerSchema.safeParse({
      email,
      password,
      displayName,
      requestedRole,
      teacherCode,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const body: RegisterDto = {
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: parsed.data.displayName,
        requestedRole: parsed.data.requestedRole,
      };
      if (parsed.data.teacherCode) {
        body.teacherCode = parsed.data.teacherCode;
      }
      await register(body);
      navigate("/login", { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setFormError(null);
    saveOAuthTeacherCode(teacherCode);
    try {
      const { url } = await googleAuthUrl();
      window.location.assign(url);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={busy} className="flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Đăng ký</h1>
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
        id="displayName"
        label="Tên hiển thị"
        autoComplete="name"
        value={displayName}
        onChange={setDisplayName}
        error={errors.displayName}
      />
      <TextField
        id="password"
        label="Mật khẩu"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={errors.password}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="requestedRole" className="text-sm font-medium">Vai trò</label>
        <select
          id="requestedRole"
          value={requestedRole}
          onChange={(event) => setRequestedRole(event.target.value as Role)}
          className="rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <option value={Role.STUDENT}>Học sinh</option>
          <option value={Role.TEACHER}>Giáo viên</option>
        </select>
      </div>
      <TextField
        id="teacherCode"
        label="Mã giáo viên (khi đăng ký giáo viên)"
        value={teacherCode}
        onChange={setTeacherCode}
        error={errors.teacherCode}
      />
      {formError ? <FormAlert message={formError} /> : null}
      <Button type="submit" disabled={busy}>Đăng ký</Button>
      <Button type="button" variant="secondary" onClick={onGoogle}>
        Đăng ký với Google
      </Button>
      <p className="text-sm">
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </form>
  );
}
