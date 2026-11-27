import { useCallback, useState } from "react";
import type { Page, StudentExamListItem, StudentExamMetadata, StudentExamListQuery } from "@quiz/shared";
import { Link } from "react-router-dom";
import { listStudentExams } from "@/features/exams/api.js";
import { studentExamStateLabel } from "@/features/exams/student/student-exam-read.js";
import { useStudentExamRead } from "@/features/exams/student/use-student-exam-read.js";

type FilterState = Exclude<StudentExamListQuery["state"], undefined> | "ALL";

const filterOptions: { value: FilterState; label: string }[] = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "SCHEDULED", label: "Chờ mở" },
  { value: "OPEN", label: "Đang mở" },
  { value: "CLOSED", label: "Đã đóng" },
];

function listMetadata(page: Page<StudentExamListItem>): readonly StudentExamMetadata[] {
  return page.items.map((item) => item.metadata);
}

function StudentExamListItemView({ item }: { item: StudentExamListItem }) {
  const { metadata } = item;
  const opensAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(metadata.opensAt));
  const closesAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(metadata.closesAt));
  return (
    <li className="min-w-0 border-b border-gray-200 last:border-b-0">
      <Link
        to={item.detailPath}
        aria-label={"Xem thông tin đề thi: " + item.metadata.title}
        className="block min-w-0 rounded-md p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <span className="block min-w-0 break-words font-medium text-blue-800 underline">{metadata.title}</span>
        <span className="mt-2 grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-sm text-gray-700 sm:grid-cols-2">
          <span className="min-w-0 break-words">Giáo viên: {metadata.teacherName}</span>
          <span>{studentExamStateLabel(metadata.state)}</span>
          <span>Số câu hỏi: {metadata.questionCount}</span>
          <span>Thời lượng: {metadata.durationMinutes} phút</span>
          <span>Thời gian mở: {opensAt}</span>
          <span>Thời gian đóng: {closesAt}</span>
          <span>Số lượt tối đa: {metadata.maxAttempts}</span>
          <span>Yêu cầu mật khẩu: {metadata.passwordRequired ? "Có" : "Không"}</span>
          <span>Cho xem lại đáp án: {metadata.allowAnswerReview ? "Có" : "Không"}</span>
          <span className="min-w-0 break-words">Lớp học đủ điều kiện: {metadata.qualifyingClassroomNames.join(", ")}</span>
        </span>
      </Link>
    </li>
  );
}

function ReadFeedback({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p aria-live="polite" aria-busy="true" className="py-4 text-sm text-gray-600">Đang tải danh sách đề thi…</p>;
  if (error === null) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3">
      <p role="alert" className="min-w-0 flex-1 break-words text-sm text-red-900">{error}</p>
      <button type="button" onClick={onRetry} className="rounded-md border border-red-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">Thử tải lại</button>
    </div>
  );
}

function PageNavigation({ page, cursor, onCursorChange }: {
  page: Page<StudentExamListItem> | null;
  cursor: string | undefined;
  onCursorChange: (cursor: string | undefined) => void;
}) {
  return (
    <nav aria-label="Phân trang đề thi" className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={!cursor} onClick={() => onCursorChange(undefined)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Trang đầu</button>
      <button type="button" disabled={!page?.nextCursor} onClick={() => onCursorChange(page?.nextCursor ?? undefined)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Trang tiếp</button>
    </nav>
  );
}

export function StudentExamsPage() {
  const [filter, setFilter] = useState<FilterState>("ALL");
  const [cursor, setCursor] = useState<string>();
  const read = useCallback(() => listStudentExams({
    ...(filter === "ALL" ? {} : { state: filter }),
    ...(cursor === undefined ? {} : { cursor }),
  }), [cursor, filter]);
  const result = useStudentExamRead(read, listMetadata);
  const page = result.data;

  function changeFilter(value: FilterState) {
    setCursor(undefined);
    setFilter(value);
  }

  return (
    <main className="mx-auto flex min-w-0 max-w-4xl flex-col gap-5 p-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold">Đề thi được giao</h1>
          <p className="mt-1 text-sm text-gray-600">Thông tin đề thi dành cho các lớp bạn đã được duyệt.</p>
        </div>
        <Link to="/student" className="rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Khu vực học sinh</Link>
      </header>
      <label htmlFor="student-exam-state" className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        Lọc trạng thái
        <select id="student-exam-state" value={filter} onChange={(event) => changeFilter(event.target.value as FilterState)} className="min-h-11 max-w-full rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          {filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <ReadFeedback loading={result.status === "loading"} error={result.error} onRetry={result.reload} />
      {result.status === "ready" && page?.items.length === 0 ? (
        <p className="break-words rounded-md border border-gray-300 p-4 text-sm text-gray-700">Chưa có đề thi trong trạng thái này.</p>
      ) : null}
      {page?.items.length ? (
        <ul aria-label="Danh sách đề thi" aria-busy={result.status === "loading"} className="min-w-0 divide-y divide-gray-200 rounded-md border border-gray-300">
          {page.items.map((item) => <StudentExamListItemView key={item.detailPath} item={item} />)}
        </ul>
      ) : null}
      <PageNavigation page={page} cursor={cursor} onCursorChange={setCursor} />
    </main>
  );
}
