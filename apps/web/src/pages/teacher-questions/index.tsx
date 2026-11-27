import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { FormAlert } from "@/components/ui/field.js";
import {
  apiErrorMessage,
  deleteQuestion,
  listQuestions,
  listSubjects,
} from "@/features/questions/api.js";
import { DeleteQuestionDialog } from "@/features/questions/delete-question-dialog.js";
import { parseQuestionQuery, QuestionFilters } from "@/features/questions/question-filters.js";
import { QuestionTable } from "@/features/questions/question-table.js";
import type { QuestionDtoWire, QuestionListWire, SubjectWire } from "@/features/questions/schemas.js";

export { QuestionEditorPage } from "./editor.js";

export function QuestionBankPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const queryKey = searchParams.toString();
  const saved = (location.state as { saved?: boolean } | null)?.saved === true;

  const [data, setData] = useState<QuestionListWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<readonly SubjectWire[]>([]);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<QuestionDtoWire | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = parseQuestionQuery(new URLSearchParams(queryKey));
    listQuestions(query)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Keep the previous page on a failed refetch (spec §6 Recovery).
        setError(apiErrorMessage(cause));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, reloadKey]);

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
  }, [reloadKey]);

  async function handleConfirmDelete(id: string): Promise<void> {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteQuestion(id);
      setSelected(null);
      // Deleting the last row on a page moves back one page (PRD §7).
      if (data !== null && data.items.length === 1 && data.page > 1) {
        const next = new URLSearchParams(searchParams);
        next.set("page", String(data.page - 1));
        setSearchParams(next);
      } else {
        setReloadKey((key) => key + 1);
      }
    } catch (cause) {
      setDeleteError(apiErrorMessage(cause));
    } finally {
      setDeletePending(false);
    }
  }

  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const total = data?.total ?? 0;

  function goToPage(nextPage: number): void {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  }

  function changePageSize(size: number): void {
    const next = new URLSearchParams(searchParams);
    next.set("pageSize", String(size));
    next.delete("page");
    setSearchParams(next);
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Ngân hàng câu hỏi</h1>
        <Link
          to="/teacher/questions/new"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Tạo câu hỏi
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        Chỉ hiển thị câu hỏi do bạn sở hữu. Học sinh không có quyền truy cập ngân hàng câu hỏi.
      </p>
      {saved ? <FormAlert message="Đã lưu câu hỏi." tone="success" /> : null}
      {subjectsError !== null ? <FormAlert message={`Không tải được danh mục: ${subjectsError}`} /> : null}

      <QuestionFilters subjects={subjects} />

      {error !== null && data !== null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 p-3">
          <FormAlert message={`Không thể tải lại danh sách: ${error}`} />
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Thử lại
          </button>
        </div>
      ) : null}

      <div aria-busy={loading && data !== null}>
        <QuestionTable
          questions={data?.items ?? []}
          loading={loading && data === null}
          error={error !== null && data === null ? error : null}
          onRetry={() => setReloadKey((key) => key + 1)}
          onDelete={(question) => {
            setSelected(question);
            setDeleteError(null);
          }}
        />
      </div>

      {data !== null && total > 0 ? (
        <nav aria-label="Phân trang" className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Trang trước
          </button>
          <span className="text-sm" aria-live="polite">
            Trang {page} / {totalPages} · {total} câu hỏi
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Trang sau
          </button>
          <label htmlFor="bank-page-size" className="text-sm">Số dòng / trang</label>
          <select
            id="bank-page-size"
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="rounded-md border border-gray-400 px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </nav>
      ) : null}

      <DeleteQuestionDialog
        question={selected}
        pending={deletePending}
        error={deleteError}
        onConfirm={(id) => {
          void handleConfirmDelete(id);
        }}
        onCancel={() => {
          if (!deletePending) {
            setSelected(null);
            setDeleteError(null);
          }
        }}
      />
    </main>
  );
}
