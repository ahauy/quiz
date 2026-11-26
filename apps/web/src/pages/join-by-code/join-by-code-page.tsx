import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FormAlert, TextField } from "@/components/ui/field.js";
import { Button } from "@/components/ui/button.js";
import { joinClassroom } from "@/lib/classroom-api.js";
import { fieldErrors, getErrorMessage, joinByCodeSchema } from "@/lib/forms.js";

export function JoinByCodePage() {
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccess(false);
    const parsed = joinByCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await joinClassroom(parsed.data.code);
      setCode("");
      setSuccess(true);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      aria-busy={busy}
      className="flex max-w-md flex-col gap-4"
      data-testid="join-by-code-page"
    >
      <h1 className="text-xl font-semibold">Tham gia lớp học bằng mã</h1>
      <TextField
        id="code"
        label="Mã lớp"
        value={code}
        onChange={setCode}
        error={errors.code}
        placeholder="ABC234"
      />
      {formError ? <FormAlert message={formError} /> : null}
      {success ? (
        <FormAlert tone="success" message="Đã gửi yêu cầu tham gia. Chờ giáo viên duyệt." />
      ) : null}
      <Button type="submit" disabled={busy}>Tham gia lớp</Button>
      <p className="text-sm">
        <Link to="/student/classrooms">Xem danh sách lớp học</Link>
      </p>
    </form>
  );
}
