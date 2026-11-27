import { useEffect, useRef, useState } from "react";
import { RichContentRenderer } from "./rich-content-renderer.js";

const MAX_LENGTH = 5000;

interface ExplanationFieldProps {
  value: string;
  onChange: (next: string) => void;
  error: string | undefined;
}

export function ExplanationField({ value, onChange, error }: ExplanationFieldProps) {
  // Preview refreshes on blur, not on every keystroke (PRD §7). External value
  // changes (e.g. loading an existing question) still sync while unfocused.
  const [preview, setPreview] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setPreview(value);
  }, [value]);

  return (
    <section aria-label="Lời giải" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="question-explanation" className="text-sm font-medium">
          Lời giải <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <span className="text-xs text-gray-600" aria-live="off">
          {value.length} / {MAX_LENGTH}
        </span>
      </div>
      <textarea
        id="question-explanation"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setPreview(value);
        }}
        rows={6}
        maxLength={MAX_LENGTH}
        placeholder="Giải thích chi tiết đáp án. Hỗ trợ $...$, khối code và ảnh /uploads/."
        required
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "question-explanation-error" : "question-explanation-hint"}
        className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm aria-[invalid=true]:border-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      />
      <p id="question-explanation-hint" className="text-xs text-gray-600">
        Bắt buộc, tối đa 5 000 ký tự. Chỉ giáo viên sở hữu câu hỏi thấy lời giải.
      </p>
      {error !== undefined ? (
        <p id="question-explanation-error" role="alert" className="text-sm text-red-600">{error}</p>
      ) : null}
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Xem trước lời giải</h2>
        <RichContentRenderer content={preview} />
      </div>
    </section>
  );
}
