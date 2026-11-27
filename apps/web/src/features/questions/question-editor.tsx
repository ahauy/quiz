import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { QuestionType, type CreateQuestionDto } from "@quiz/shared";
import { Button } from "@/components/ui/button.js";
import { FormAlert } from "@/components/ui/field.js";
import { ClassificationFields } from "./classification-fields.js";
import { ExplanationField } from "./explanation-field.js";
import { ImageUpload } from "./image-upload.js";
import { RichContentRenderer } from "./rich-content-renderer.js";
import {
  changeFormType,
  questionTypeLabels,
  toWriteDto,
  updateBaseFields,
  validateFormValue,
  type QuestionFormBase,
  type QuestionFormValue,
} from "./form-model.js";
import type { SubjectWire } from "./schemas.js";
import { FillBlankForm } from "./forms/fill-blank-form.js";
import { MatchingForm } from "./forms/matching-form.js";
import { MultipleChoiceForm } from "./forms/multiple-choice-form.js";
import { SingleChoiceForm } from "./forms/single-choice-form.js";
import { TrueFalseForm } from "./forms/true-false-form.js";

const MAX_CONTENT_LENGTH = 5000;

// Field ids used to move focus to the first invalid control after a failed save.
const errorFieldIds: Readonly<Record<string, string>> = {
  content: "question-content",
  explanation: "question-explanation",
  subjectName: "question-subject",
  chapterName: "question-chapter",
  options: "question-options",
  correctOptionIndexes: "question-options",
  acceptedAnswers: "question-accepted-answers",
  pairs: "question-pairs",
};

function hasTypeAnswers(value: QuestionFormValue): boolean {
  switch (value.type) {
    case QuestionType.SINGLE_CHOICE:
    case QuestionType.MULTIPLE_CHOICE:
      return (
        value.options.some((option) => option.trim().length > 0) ||
        value.correctOptionIndexes.length > 0
      );
    case QuestionType.TRUE_FALSE:
      return false;
    case QuestionType.FILL_BLANK:
      return value.acceptedAnswers.some((answer) => answer.trim().length > 0);
    case QuestionType.MATCHING:
      return value.pairs.some(
        (pair) => pair.leftText.trim().length > 0 || pair.rightText.trim().length > 0,
      );
  }
}

interface TypeChangeDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Native <dialog>.showModal() supplies the focus trap, Escape handling and focus
// restoration for free (NFR-QB-002) — no custom modal wrapper needed.
function TypeChangeDialog({ open, onConfirm, onCancel }: TypeChangeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      aria-labelledby="type-change-title"
      aria-describedby="type-change-description"
      className="w-full max-w-md rounded-md border border-gray-300 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/50"
    >
      <h2 id="type-change-title" className="text-lg font-semibold">Đổi dạng câu hỏi?</h2>
      <p id="type-change-description" className="mt-2 text-sm">
        Các đáp án riêng của dạng hiện tại sẽ bị xóa. Bạn có chắc chắn muốn tiếp tục?
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
        >
          Đổi dạng
        </button>
      </div>
    </dialog>
  );
}

interface QuestionEditorProps {
  mode: "create" | "edit";
  initialValue: QuestionFormValue;
  subjects: readonly SubjectWire[];
  pending?: boolean | undefined;
  error?: string | null | undefined;
  onSubmit: (dto: CreateQuestionDto) => void;
  onCancel: () => void;
}

export function QuestionEditor({
  mode,
  initialValue,
  subjects,
  pending = false,
  error = null,
  onSubmit,
  onCancel,
}: QuestionEditorProps) {
  const [value, setValue] = useState<QuestionFormValue>(initialValue);
  const [attempted, setAttempted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingType, setPendingType] = useState<QuestionType | null>(null);
  const [preview, setPreview] = useState(initialValue.content);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const contentFocused = useRef(false);

  useEffect(() => {
    if (!contentFocused.current) setPreview(value.content);
  }, [value.content]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const errors: Readonly<Record<string, string>> = attempted ? validateFormValue(value) : {};

  function handleChange(next: QuestionFormValue): void {
    setValue(next);
    setDirty(true);
  }

  function patchBase(patch: Partial<QuestionFormBase>): void {
    setValue((current) => updateBaseFields(current, patch));
    setDirty(true);
  }

  function insertAtCursor(text: string): void {
    const element = contentRef.current;
    if (element === null) {
      patchBase({ content: value.content + text });
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    setValue((current) =>
      updateBaseFields(current, {
        content: current.content.slice(0, start) + text + current.content.slice(end),
      }),
    );
    setDirty(true);
    requestAnimationFrame(() => {
      element.focus();
      const caret = start + text.length;
      element.setSelectionRange(caret, caret);
    });
  }

  function requestTypeChange(nextType: QuestionType): void {
    if (nextType === value.type) return;
    if (!hasTypeAnswers(value)) {
      handleChange(changeFormType(value, nextType));
      setAttempted(false);
      return;
    }
    setPendingType(nextType);
  }

  function confirmTypeChange(): void {
    if (pendingType === null) return;
    handleChange(changeFormType(value, pendingType));
    setAttempted(false);
    setPendingType(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;
    setAttempted(true);
    const nextErrors = validateFormValue(value);
    const firstKey = Object.keys(nextErrors)[0];
    if (firstKey !== undefined) {
      const fieldId = errorFieldIds[firstKey];
      requestAnimationFrame(() => {
        if (fieldId !== undefined) document.getElementById(fieldId)?.focus();
      });
      return;
    }
    setDirty(false);
    onSubmit(toWriteDto(value));
  }

  function handleCancel(): void {
    if (dirty && !window.confirm("Bạn có thay đổi chưa lưu. Rời khỏi trang?")) return;
    onCancel();
  }

  function renderTypeBody(): ReactNode {
    switch (value.type) {
      case QuestionType.SINGLE_CHOICE:
        return <SingleChoiceForm value={value} onChange={handleChange} errors={errors} />;
      case QuestionType.MULTIPLE_CHOICE:
        return <MultipleChoiceForm value={value} onChange={handleChange} errors={errors} />;
      case QuestionType.TRUE_FALSE:
        return <TrueFalseForm value={value} onChange={handleChange} errors={errors} />;
      case QuestionType.FILL_BLANK:
        return (
          <FillBlankForm
            value={value}
            onChange={handleChange}
            errors={errors}
            onInsertBlank={() => insertAtCursor("{{blank}}")}
          />
        );
      case QuestionType.MATCHING:
        return <MatchingForm value={value} onChange={handleChange} errors={errors} />;
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="flex max-w-3xl flex-col gap-5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold">
            {mode === "create" ? "Tạo câu hỏi mới" : "Sửa câu hỏi"}
          </h1>
          <span className="text-xs text-gray-600">
            {pending ? "Đang lưu…" : dirty ? "Chưa lưu thay đổi" : "Đã lưu"}
          </span>
        </div>

        {error !== null ? <FormAlert message={error} /> : null}
        {attempted && Object.keys(errors).length > 0 ? (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">Vui lòng sửa các lỗi sau:</p>
            <ul className="mt-1 list-inside list-disc text-sm text-red-700">
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label htmlFor="question-type" className="text-sm font-medium">Dạng câu hỏi</label>
          <select
            id="question-type"
            value={value.type}
            onChange={(event) => requestTypeChange(event.target.value as QuestionType)}
            disabled={pending}
            className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {(Object.keys(questionTypeLabels) as QuestionType[]).map((type) => (
              <option key={type} value={type}>{questionTypeLabels[type]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="question-content" className="text-sm font-medium">
              Nội dung câu hỏi <span aria-hidden="true" className="text-red-700">*</span>
            </label>
            <span className="text-xs text-gray-600">{value.content.length} / {MAX_CONTENT_LENGTH}</span>
          </div>
          <textarea
            ref={contentRef}
            id="question-content"
            value={value.content}
            onChange={(event) => patchBase({ content: event.target.value })}
            onFocus={() => { contentFocused.current = true; }}
            onBlur={() => { contentFocused.current = false; setPreview(value.content); }}
            rows={6}
            maxLength={MAX_CONTENT_LENGTH}
            required
            aria-required="true"
            aria-invalid={errors.content ? true : undefined}
            aria-describedby={errors.content ? "question-content-error" : "question-content-hint"}
            className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm aria-[invalid=true]:border-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          />
          <p id="question-content-hint" className="text-xs text-gray-600">
            Hỗ trợ $...$ / $$...$$, khối code ```...``` và ảnh /uploads/.
          </p>
          {errors.content !== undefined ? (
            <p id="question-content-error" role="alert" className="text-sm text-red-600">{errors.content}</p>
          ) : null}
          <ImageUpload onInsert={insertAtCursor} />
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Xem trước nội dung</h2>
            <RichContentRenderer content={preview} />
          </div>
        </div>

        {renderTypeBody()}

        <ClassificationFields
          value={{
            subjectName: value.subjectName,
            chapterName: value.chapterName,
            difficulty: value.difficulty,
          }}
          onChange={(patch) => patchBase(patch)}
          subjects={subjects}
          errors={errors}
        />

        <ExplanationField
          value={value.explanation}
          onChange={(next) => patchBase({ explanation: next })}
          error={errors.explanation}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu…" : mode === "create" ? "Tạo câu hỏi" : "Lưu thay đổi"}
          </Button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Hủy
          </button>
        </div>
      </form>

      <TypeChangeDialog
        open={pendingType !== null}
        onConfirm={confirmTypeChange}
        onCancel={() => setPendingType(null)}
      />
    </>
  );
}
