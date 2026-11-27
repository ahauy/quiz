import { useEffect, type FormEvent } from "react";
import type { DraftEditorState, DraftSettings } from "./use-draft-editor.js";

interface Props {
  state: DraftEditorState;
  onChange: (field: keyof DraftSettings, value: string) => void;
  onSave: () => void;
  locked: boolean;
}
const fieldClass = "w-full min-w-0 rounded-md border border-gray-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-gray-100";
function TextSetting({ id, label, value, onChange, disabled, inputMode, error }: { id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean; inputMode?: "numeric"; error?: string }) {
  const errorId = `${id}-error`;
  return <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-medium">{label}<input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className={fieldClass} type="text" inputMode={inputMode} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />{error && <span id={errorId} className="text-sm font-normal text-red-700">{error}</span>}</label>;
}
function AnswerReviewSetting({ value, onChange, disabled, error }: { value: DraftSettings["allowAnswerReview"]; onChange: (value: string) => void; disabled: boolean; error?: string }) {
  return <label htmlFor="exam-answer-review" className="flex min-w-0 flex-col gap-1 text-sm font-medium">Cho phép xem đáp án sau khi nộp<select id="exam-answer-review" aria-invalid={error ? true : undefined} aria-describedby={error ? "exam-answer-review-error" : undefined} className={fieldClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="unset">Chưa chọn</option><option value="yes">Cho phép</option><option value="no">Không cho phép</option></select>{error && <span id="exam-answer-review-error" className="text-sm font-normal text-red-700">{error}</span>}</label>;
}
function PasswordSetting({ state, onChange, disabled }: { state: DraftEditorState; onChange: Props["onChange"]; disabled: boolean }) {
  const mode = state.settings.passwordMode;
  const passwordError = state.fieldErrors.passwordValue;
  return <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-3"><legend className="px-1 text-sm font-medium">Bảo vệ bằng mật khẩu</legend><p className="text-sm text-gray-600">{state.exam?.passwordRequired ? "Đề đang được bảo vệ. Mật khẩu đã lưu không được hiển thị." : "Đề hiện không có mật khẩu."}</p><label className="flex items-center gap-2 text-sm"><input type="radio" name="exam-password-mode" value="unchanged" checked={mode === "unchanged"} disabled={disabled} onChange={() => onChange("passwordMode", "unchanged")} />Giữ nguyên cấu hình</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="exam-password-mode" value="set" checked={mode === "set"} disabled={disabled} onChange={() => onChange("passwordMode", "set")} />Đặt hoặc đổi mật khẩu</label>{mode === "set" && <label htmlFor="exam-password" className="flex flex-col gap-1 text-sm font-medium">Mật khẩu mới<input id="exam-password" type="password" autoComplete="new-password" aria-invalid={passwordError ? true : undefined} aria-describedby={passwordError ? "exam-password-error" : undefined} className={fieldClass} value={state.settings.passwordValue} disabled={disabled} onChange={(event) => onChange("passwordValue", event.target.value)} />{passwordError && <span id="exam-password-error" className="text-sm font-normal text-red-700">{passwordError}</span>}</label>}<label className="flex items-center gap-2 text-sm"><input type="radio" name="exam-password-mode" value="disable" checked={mode === "disable"} disabled={disabled} onChange={() => onChange("passwordMode", "disable")} />Tắt bảo vệ bằng mật khẩu</label></fieldset>;
}
function SettingsFields({ state, onChange, disabled }: Pick<Props, "state" | "onChange"> & { disabled: boolean }) {
  const value = state.settings;
  const change = (field: keyof DraftSettings) => (next: string) => onChange(field, next);
  const dateField = (field: "opensAt" | "closesAt", id: string, label: string) => { const error = state.fieldErrors[field]; const errorId = `${id}-error`; return <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-medium">{label}<input id={id} type="datetime-local" step="0.001" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className={fieldClass} value={value[field]} disabled={disabled} onChange={(event) => change(field)(event.target.value)} />{error && <span id={errorId} className="text-sm font-normal text-red-700">{error}</span>}</label>; };
  return <div className="grid min-w-0 gap-4 md:grid-cols-2"><TextSetting id="exam-title" label="Tên đề" value={value.title} disabled={disabled} onChange={change("title")} {...(state.fieldErrors.title ? { error: state.fieldErrors.title } : {})} /><TextSetting id="exam-duration" label="Thời lượng (phút)" value={value.durationMinutes} inputMode="numeric" disabled={disabled} onChange={change("durationMinutes")} {...(state.fieldErrors.durationMinutes ? { error: state.fieldErrors.durationMinutes } : {})} /><TextSetting id="exam-max-attempts" label="Số lượt làm bài" value={value.maxAttempts} inputMode="numeric" disabled={disabled} onChange={change("maxAttempts")} {...(state.fieldErrors.maxAttempts ? { error: state.fieldErrors.maxAttempts } : {})} /><AnswerReviewSetting value={value.allowAnswerReview} disabled={disabled} onChange={change("allowAnswerReview")} {...(state.fieldErrors.allowAnswerReview ? { error: state.fieldErrors.allowAnswerReview } : {})} />{dateField("opensAt", "exam-opens-at", "Giờ mở (giờ Việt Nam)")}{dateField("closesAt", "exam-closes-at", "Giờ đóng (giờ Việt Nam)")}<div className="md:col-span-2"><PasswordSetting state={state} onChange={onChange} disabled={disabled} /></div></div>;
}
export function DraftSettingsForm({ state, onChange, onSave, locked }: Props) {
  useEffect(() => {
    if (Object.keys(state.fieldErrors).length === 0) return;
    const fieldIds: Partial<Record<keyof DraftSettings, string>> = {
      title: "exam-title", durationMinutes: "exam-duration", maxAttempts: "exam-max-attempts",
      allowAnswerReview: "exam-answer-review", opensAt: "exam-opens-at", closesAt: "exam-closes-at", passwordValue: "exam-password",
    };
    const firstInvalid = (Object.keys(state.fieldErrors) as (keyof DraftSettings)[]).map((field) => fieldIds[field]).find(Boolean);
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  }, [state.fieldErrorFocusRequestId]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSave(); }
  const disabled = locked || state.pending || state.loading;
  const validationMessages = Object.values(state.fieldErrors);
  return <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-4"><h2 className="text-lg font-semibold [overflow-wrap:anywhere]">Cấu hình đề</h2><SettingsFields state={state} onChange={onChange} disabled={disabled} />{validationMessages.length > 0 && <p role="alert" aria-live="assertive" className="text-sm text-red-700">Có {validationMessages.length} lỗi cần sửa: {validationMessages.join(" ")}</p>}{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.notice && <p role="status" aria-live="polite" className="text-sm text-gray-700">{state.notice}</p>}<div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={disabled || !state.dirty} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Lưu cấu hình</button>{state.dirty && <span className="text-sm text-amber-800">Có thay đổi chưa lưu</span>}</div></form>;
}
