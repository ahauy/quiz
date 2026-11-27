import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Difficulty, QuestionType, type QuestionListQueryDto } from "@quiz/shared";
import { difficultyLabels, questionTypeLabels } from "./form-model.js";
import type { SubjectWire } from "./schemas.js";

// URL query is the single source of truth. The bank page and this bar both read
// it; every change resets `page` to 1 and preserves `pageSize`.
export function parseQuestionQuery(params: URLSearchParams): QuestionListQueryDto {
  const query: QuestionListQueryDto = {};
  const subjectId = params.get("subjectId");
  const chapterId = params.get("chapterId");
  const difficulty = params.get("difficulty");
  const type = params.get("type");
  const q = params.get("q");
  const page = Number.parseInt(params.get("page") ?? "", 10);
  const pageSize = Number.parseInt(params.get("pageSize") ?? "", 10);

  if (subjectId !== null && subjectId !== "") query.subjectId = subjectId;
  if (chapterId !== null && chapterId !== "") query.chapterId = chapterId;
  if (isDifficulty(difficulty)) query.difficulty = difficulty;
  if (isQuestionType(type)) query.type = type;
  if (q !== null && q.trim() !== "") query.q = q.trim();
  if (Number.isInteger(page) && page >= 1) query.page = page;
  if (Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50) query.pageSize = pageSize;
  return query;
}

function isDifficulty(value: string | null): value is Difficulty {
  return value === Difficulty.EASY || value === Difficulty.MEDIUM || value === Difficulty.HARD;
}

const questionTypes: readonly QuestionType[] = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
  QuestionType.MATCHING,
];

function isQuestionType(value: string | null): value is QuestionType {
  return value !== null && (questionTypes as readonly string[]).includes(value);
}

const selectClass =
  "w-full rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

interface QuestionFiltersProps {
  subjects: readonly SubjectWire[];
}

interface ActiveChip {
  key: string;
  label: string;
  clear: () => void;
}

export function QuestionFilters({ subjects }: QuestionFiltersProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = parseQuestionQuery(searchParams);
  const [draftQ, setDraftQ] = useState(query.q ?? "");
  useEffect(() => {
    setDraftQ(query.q ?? "");
  }, [query.q]);

  function update(patch: Readonly<Record<string, string | undefined>>): void {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    setSearchParams(next);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    update({ q: draftQ.trim() === "" ? undefined : draftQ.trim() });
  }

  const selectedSubject = subjects.find((subject) => subject.id === query.subjectId);
  const chapters = selectedSubject?.chapters ?? [];
  const activeChips: ActiveChip[] = [];
  if (query.subjectId !== undefined) {
    const name = selectedSubject?.name ?? query.subjectId;
    activeChips.push({
      key: "subjectId",
      label: `Môn: ${name}`,
      clear: () => update({ subjectId: undefined, chapterId: undefined }),
    });
  }
  if (query.chapterId !== undefined) {
    const chapter = chapters.find((item) => item.id === query.chapterId);
    activeChips.push({
      key: "chapterId",
      label: `Chương: ${chapter?.name ?? query.chapterId}`,
      clear: () => update({ chapterId: undefined }),
    });
  }
  if (query.difficulty !== undefined) {
    activeChips.push({
      key: "difficulty",
      label: `Độ khó: ${difficultyLabels[query.difficulty]}`,
      clear: () => update({ difficulty: undefined }),
    });
  }
  if (query.type !== undefined) {
    activeChips.push({
      key: "type",
      label: `Loại: ${questionTypeLabels[query.type]}`,
      clear: () => update({ type: undefined }),
    });
  }
  if (query.q !== undefined) {
    activeChips.push({
      key: "q",
      label: `Từ khóa: ${query.q}`,
      clear: () => update({ q: undefined }),
    });
  }

  const hasFilters = activeChips.length > 0;

  return (
    <section aria-label="Bộ lọc câu hỏi" className="flex flex-col gap-3 rounded-md border border-gray-300 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-subject" className="text-sm font-medium">Môn học</label>
          <select
            id="filter-subject"
            value={query.subjectId ?? ""}
            onChange={(event) => update({ subjectId: event.target.value || undefined, chapterId: undefined })}
            className={selectClass}
          >
            <option value="">Tất cả môn</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-chapter" className="text-sm font-medium">Chương</label>
          <select
            id="filter-chapter"
            value={query.chapterId ?? ""}
            onChange={(event) => update({ chapterId: event.target.value || undefined })}
            disabled={selectedSubject === undefined}
            className={selectClass}
          >
            <option value="">Tất cả chương</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-difficulty" className="text-sm font-medium">Độ khó</label>
          <select
            id="filter-difficulty"
            value={query.difficulty ?? ""}
            onChange={(event) => update({ difficulty: event.target.value || undefined })}
            className={selectClass}
          >
            <option value="">Tất cả độ khó</option>
            {(Object.keys(difficultyLabels) as Difficulty[]).map((difficulty) => (
              <option key={difficulty} value={difficulty}>{difficultyLabels[difficulty]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-type" className="text-sm font-medium">Dạng câu hỏi</label>
          <select
            id="filter-type"
            value={query.type ?? ""}
            onChange={(event) => update({ type: event.target.value || undefined })}
            className={selectClass}
          >
            <option value="">Tất cả dạng</option>
            {questionTypes.map((type) => (
              <option key={type} value={type}>{questionTypeLabels[type]}</option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <label htmlFor="filter-q" className="text-sm font-medium">Tìm theo nội dung</label>
          <input
            id="filter-q"
            type="search"
            value={draftQ}
            onChange={(event) => setDraftQ(event.target.value)}
            maxLength={200}
            placeholder="Nhập từ khóa…"
            className={selectClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Tìm kiếm
        </button>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => setSearchParams(new URLSearchParams())}
            className="rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Xóa bộ lọc
          </button>
        ) : null}
      </form>

      {hasFilters ? (
        <ul aria-label="Bộ lọc đang áp dụng" className="flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <li key={chip.key}>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-900">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.clear}
                  aria-label={`Bỏ lọc ${chip.label}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full p-1 text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
