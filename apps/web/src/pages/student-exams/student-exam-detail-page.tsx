import { useCallback } from "react";
import type { StudentExamMetadata } from "@quiz/shared";
import { Link, useParams } from "react-router-dom";
import { getStudentExam } from "@/features/exams/api.js";
import { StudentExamMetadataView } from "@/features/exams/student/student-exam-metadata.js";
import { useStudentExamRead } from "@/features/exams/student/use-student-exam-read.js";

function oneMetadata(metadata: StudentExamMetadata): readonly StudentExamMetadata[] {
  return [metadata];
}

export function StudentExamDetailPage() {
  const { id = "" } = useParams();
  const read = useCallback(() => getStudentExam(id), [id]);
  const result = useStudentExamRead(read, oneMetadata, true);

  return (
    <main className="mx-auto flex min-w-0 max-w-4xl flex-col gap-5 p-4">
      <Link to="/student/exams" className="flex min-h-11 w-fit items-center rounded-md px-1 py-2 text-sm text-blue-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Quay lại danh sách đề thi</Link>
      {result.status === "loading" ? (
        <p aria-live="polite" aria-busy="true" className="py-4 text-sm text-gray-600">Đang tải thông tin đề thi…</p>
      ) : null}
      {result.status === "error" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3">
          <p role="alert" className="min-w-0 flex-1 break-words text-sm text-red-900">{result.error}</p>
          <button type="button" onClick={result.reload} className="rounded-md border border-red-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">Thử tải lại</button>
        </div>
      ) : null}
      {result.status === "ready" && result.data ? <StudentExamMetadataView metadata={result.data} /> : null}
    </main>
  );
}
