import type { StudentExamMetadata } from "@quiz/shared";
import type { ReactNode } from "react";
import { studentExamStateLabel } from "./student-exam-read.js";

function MetadataEntry({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 break-words"><dt className="text-sm text-gray-600">{label}</dt><dd className="mt-1 font-medium text-gray-900">{children}</dd></div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function StudentExamMetadataView({ metadata }: { metadata: StudentExamMetadata }) {
  return (
    <article aria-labelledby="student-exam-title" className="flex min-w-0 flex-col gap-5">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h1 id="student-exam-title" className="min-w-0 break-words text-xl font-semibold">{metadata.title}</h1>
        <span className="rounded-full border border-gray-300 px-3 py-1 text-sm font-medium">{studentExamStateLabel(metadata.state)}</span>
      </header>
      <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <MetadataEntry label="Giáo viên">{metadata.teacherName}</MetadataEntry>
        <MetadataEntry label="Số câu hỏi">{metadata.questionCount} câu</MetadataEntry>
        <MetadataEntry label="Thời lượng">{metadata.durationMinutes} phút</MetadataEntry>
        <MetadataEntry label="Thời gian mở">{formatDate(metadata.opensAt)}</MetadataEntry>
        <MetadataEntry label="Thời gian đóng">{formatDate(metadata.closesAt)}</MetadataEntry>
        <MetadataEntry label="Số lượt tối đa">{metadata.maxAttempts}</MetadataEntry>
        <MetadataEntry label="Yêu cầu mật khẩu">{metadata.passwordRequired ? "Có" : "Không"}</MetadataEntry>
        <MetadataEntry label="Cho xem lại đáp án">{metadata.allowAnswerReview ? "Có" : "Không"}</MetadataEntry>
        <MetadataEntry label="Lớp học đủ điều kiện">
          <ul className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
            {metadata.qualifyingClassroomNames.map((name, index) => <li key={index}>{name}</li>)}
          </ul>
        </MetadataEntry>
      </dl>
    </article>
  );
}
