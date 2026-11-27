import { Difficulty } from "@quiz/shared";
import { difficultyLabels } from "./form-model.js";
import type { SubjectWire } from "./schemas.js";

export interface ClassificationValue {
  subjectName: string;
  chapterName: string;
  difficulty: Difficulty;
}

interface ClassificationFieldsProps {
  value: ClassificationValue;
  onChange: (patch: Partial<ClassificationValue>) => void;
  subjects: readonly SubjectWire[];
  errors: Readonly<Record<string, string>>;
}

const inputClass =
  "w-full rounded-md border border-gray-400 px-3 py-2 text-sm aria-[invalid=true]:border-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function ClassificationFields({ value, onChange, subjects, errors }: ClassificationFieldsProps) {
  // Catalog names are resolved by normalized key server-side; here we only need
  // a case-insensitive trim match to derive the chapter suggestions.
  const selectedSubject = subjects.find(
    (subject) => subject.name.trim().toLowerCase() === value.subjectName.trim().toLowerCase(),
  );
  const chapters = selectedSubject?.chapters ?? [];
  const subjectError = errors.subjectName;
  const chapterError = errors.chapterName;

  return (
    <section aria-label="Phân loại câu hỏi" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="question-subject" className="text-sm font-medium">
          Môn học <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <input
          id="question-subject"
          list="question-subject-options"
          type="text"
          value={value.subjectName}
          onChange={(event) => onChange({ subjectName: event.target.value, chapterName: "" })}
          placeholder="Nhập tên môn mới hoặc chọn môn có sẵn"
          autoComplete="off"
          required
          aria-required="true"
          aria-invalid={subjectError ? true : undefined}
          aria-describedby={subjectError ? "question-subject-error" : undefined}
          className={inputClass}
        />
        <datalist id="question-subject-options">
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.name} />
          ))}
        </datalist>
        {subjectError !== undefined ? (
          <p id="question-subject-error" role="alert" className="text-sm text-red-600">{subjectError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="question-chapter" className="text-sm font-medium">
          Chương <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <input
          id="question-chapter"
          list="question-chapter-options"
          type="text"
          value={value.chapterName}
          onChange={(event) => onChange({ chapterName: event.target.value })}
          placeholder="Nhập tên chương mới hoặc chọn chương có sẵn"
          autoComplete="off"
          required
          aria-required="true"
          aria-invalid={chapterError ? true : undefined}
          aria-describedby={chapterError ? "question-chapter-error" : undefined}
          className={inputClass}
        />
        <datalist id="question-chapter-options">
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.name} />
          ))}
        </datalist>
        <p className="text-xs text-gray-600">
          {selectedSubject === undefined
            ? "Chọn một môn có sẵn để gợi ý chương; chương mới vẫn được tạo khi lưu."
            : `Gợi ý chương thuộc môn ${selectedSubject.name}.`}
        </p>
        {chapterError !== undefined ? (
          <p id="question-chapter-error" role="alert" className="text-sm text-red-600">{chapterError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="question-difficulty" className="text-sm font-medium">
          Độ khó <span aria-hidden="true" className="text-red-700">*</span>
        </label>
        <select
          id="question-difficulty"
          value={value.difficulty}
          onChange={(event) => onChange({ difficulty: event.target.value as Difficulty })}
          required
          aria-required="true"
          className={inputClass}
        >
          {(Object.keys(difficultyLabels) as Difficulty[]).map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {difficultyLabels[difficulty]}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
