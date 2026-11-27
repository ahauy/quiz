import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FormAlert } from "@/components/ui/field.js";
import type { QuestionDtoWire } from "./schemas.js";

interface DeleteQuestionDialogProps {
  question: QuestionDtoWire | null;
  pending?: boolean | undefined;
  error?: string | null | undefined;
  onConfirm: (id: string) => void;
  onCancel: () => void;
}

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DeleteQuestionDialog({
  question,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: DeleteQuestionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelCallback = useRef(onCancel);
  cancelCallback.current = onCancel;

  useEffect(() => {
    if (question === null) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelCallback.current();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [question]);

  if (question === null) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-question-title"
        aria-describedby="delete-question-description"
        className="w-full max-w-md rounded-md bg-white p-5 text-gray-900 shadow-xl"
      >
        <h2 id="delete-question-title" className="text-lg font-semibold">Xóa câu hỏi?</h2>
        <p id="delete-question-description" className="mt-2 text-sm">
          Câu hỏi sẽ bị xóa vĩnh viễn. Bạn có chắc chắn muốn tiếp tục?
        </p>
        {error !== null ? <div className="mt-2"><FormAlert message={error} /></div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onConfirm(question.id)}
            disabled={pending}
            className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            {pending ? "Đang xóa…" : "Xóa"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
