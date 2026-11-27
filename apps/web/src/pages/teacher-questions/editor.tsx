import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QuestionType, type CreateQuestionDto } from "@quiz/shared";
import { FormAlert } from "@/components/ui/field.js";
import {
  apiErrorMessage,
  createQuestion,
  getQuestion,
  listSubjects,
  replaceQuestion,
} from "@/features/questions/api.js";
import { emptyFormValue, formValueFromQuestion, type QuestionFormValue } from "@/features/questions/form-model.js";
import { QuestionEditor } from "@/features/questions/question-editor.js";
import type { SubjectWire } from "@/features/questions/schemas.js";

export function QuestionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = id !== undefined;

  const [initialValue, setInitialValue] = useState<QuestionFormValue | null>(
    isEdit ? null : emptyFormValue(QuestionType.SINGLE_CHOICE),
  );
  const [subjects, setSubjects] = useState<readonly SubjectWire[]>([]);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSubjects()
      .then((result) => {
        if (!cancelled) {
          setSubjects(result);
          setSubjectsError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setSubjectsError(apiErrorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    setInitialValue(null);
    setLoadError(null);
    getQuestion(id)
      .then((question) => {
        if (!cancelled) setInitialValue(formValueFromQuestion(question));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  async function handleSubmit(dto: CreateQuestionDto): Promise<void> {
    setPending(true);
    setSaveError(null);
    try {
      if (id !== undefined) await replaceQuestion(id, dto);
      else await createQuestion(dto);
      navigate("/teacher/questions", { state: { saved: true }, replace: true });
    } catch (cause) {
      setSaveError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link
        to="/teacher/questions"
        className="self-start text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        ← Về ngân hàng câu hỏi
      </Link>

      {subjectsError !== null ? <FormAlert message={`Không tải được danh mục: ${subjectsError}`} /> : null}

      {isEdit && initialValue === null && loadError === null ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Đang tải câu hỏi"
          className="flex flex-col gap-2"
          data-testid="editor-skeleton"
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-md border border-gray-200 bg-gray-100 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}

      {isEdit && loadError !== null ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3">
          <FormAlert message={loadError} />
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Thử lại
          </button>
        </div>
      ) : null}

      {initialValue !== null ? (
        <QuestionEditor
          key={id ?? "new"}
          mode={isEdit ? "edit" : "create"}
          initialValue={initialValue}
          subjects={subjects}
          pending={pending}
          error={saveError}
          onSubmit={(dto) => {
            void handleSubmit(dto);
          }}
          onCancel={() => navigate("/teacher/questions")}
        />
      ) : null}
    </main>
  );
}
