import type { FormBodyProps, TrueFalseFormValue } from "../form-model.js";

export function TrueFalseForm({ value, onChange }: FormBodyProps<TrueFalseFormValue>) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
      <legend className="px-1 text-sm font-medium">Đáp án đúng</legend>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="true-false-answer"
            checked={value.correctAnswer === true}
            onChange={() => onChange({ ...value, correctAnswer: true })}
            className="h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          Đúng
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="true-false-answer"
            checked={value.correctAnswer === false}
            onChange={() => onChange({ ...value, correctAnswer: false })}
            className="h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          Sai
        </label>
      </div>
    </fieldset>
  );
}
