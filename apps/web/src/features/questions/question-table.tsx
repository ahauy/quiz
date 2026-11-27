import { Link } from "react-router-dom";
import { FormAlert } from "@/components/ui/field.js";
import { difficultyLabels, questionTypeLabels } from "./form-model.js";
import type { QuestionDtoWire } from "./schemas.js";

interface QuestionTableProps {
  questions: readonly QuestionDtoWire[];
  loading?: boolean | undefined;
  error?: string | null | undefined;
  onRetry?: (() => void) | undefined;
  onDelete: (question: QuestionDtoWire) => void;
}

function preview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

export function QuestionTable({
  questions,
  loading = false,
  error = null,
  onRetry,
  onDelete,
}: QuestionTableProps) {
  if (loading) {
    return (
      <div
        data-testid="question-table-skeleton"
        role="status"
        aria-busy="true"
        aria-label="Đang tải danh sách câu hỏi"
        className="flex flex-col gap-2"
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-md border border-gray-200 bg-gray-100 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="flex flex-col gap-2" data-testid="question-table-error">
        <FormAlert message={error} />
        {onRetry ? (
          <button type="button" onClick={onRetry} className="self-start text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Thử lại
          </button>
        ) : null}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="question-table-empty">
        <p className="text-sm text-gray-700">Chưa có câu hỏi nào trong ngân hàng.</p>
        <Link to="/teacher/questions/new" className="self-start text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          Tạo câu hỏi đầu tiên
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="question-table">
        <caption className="sr-only">Danh sách câu hỏi của tôi</caption>
        <thead>
          <tr className="border-b border-gray-300 text-left">
            <th scope="col" className="px-2 py-2">Nội dung</th>
            <th scope="col" className="px-2 py-2">Loại</th>
            <th scope="col" className="px-2 py-2">Độ khó</th>
            <th scope="col" className="px-2 py-2">Môn / Chương</th>
            <th scope="col" className="px-2 py-2">Cập nhật</th>
            <th scope="col" className="px-2 py-2">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((question) => (
            <tr key={question.id} className="border-b border-gray-200 align-top">
              <td className="px-2 py-2">{preview(question.content)}</td>
              <td className="px-2 py-2">{questionTypeLabels[question.type]}</td>
              <td className="px-2 py-2">{difficultyLabels[question.difficulty]}</td>
              <td className="px-2 py-2">
                <span>{question.subjectName}</span>
                <br />
                <span className="text-gray-600">{question.chapterName}</span>
              </td>
              <td className="px-2 py-2">
                {new Intl.DateTimeFormat("vi-VN").format(new Date(question.updatedAt))}
              </td>
              <td className="px-2 py-2">
                <div className="flex gap-3">
                  <Link
                    to={`/teacher/questions/${encodeURIComponent(question.id)}/edit`}
                    className="text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    aria-label={`Sửa câu hỏi môn ${question.subjectName}: ${preview(question.content)}`}
                  >
                    Sửa
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(question)}
                    className="text-red-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    aria-label={`Xóa câu hỏi môn ${question.subjectName}: ${preview(question.content)}`}
                  >
                    Xóa
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
