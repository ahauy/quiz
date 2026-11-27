import type { FormBodyProps, MultipleChoiceFormValue } from "../form-model.js";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

function withOptionText(value: MultipleChoiceFormValue, index: number, text: string): MultipleChoiceFormValue {
  return { ...value, options: value.options.map((option, i) => (i === index ? text : option)) };
}

function withoutOption(value: MultipleChoiceFormValue, index: number): MultipleChoiceFormValue {
  return {
    ...value,
    options: value.options.filter((_, i) => i !== index),
    correctOptionIndexes: value.correctOptionIndexes
      .filter((correct) => correct !== index)
      .map((correct) => (correct > index ? correct - 1 : correct)),
  };
}

function toggleCorrect(value: MultipleChoiceFormValue, index: number): MultipleChoiceFormValue {
  const selected = value.correctOptionIndexes.includes(index);
  return {
    ...value,
    correctOptionIndexes: selected
      ? value.correctOptionIndexes.filter((correct) => correct !== index)
      : [...value.correctOptionIndexes, index],
  };
}

export function MultipleChoiceForm({ value, onChange, errors }: FormBodyProps<MultipleChoiceFormValue>) {
  const optionsError = errors.options ?? errors.correctOptionIndexes;
  return (
    <fieldset id="question-options" tabIndex={-1} className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
      <legend className="px-1 text-sm font-medium">Phương án (chọn ít nhất 2 đáp án đúng)</legend>
      <div className="flex flex-col gap-2">
        {value.options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`multiple-correct-${index}`}
              checked={value.correctOptionIndexes.includes(index)}
              onChange={() => onChange(toggleCorrect(value, index))}
              aria-label={`Chọn phương án ${index + 1} làm đáp án đúng`}
              className="h-4 w-4 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <label htmlFor={`multiple-option-${index}`} className="sr-only">
              Nội dung phương án {index + 1}
            </label>
            <input
              id={`multiple-option-${index}`}
              type="text"
              value={option}
              onChange={(event) => onChange(withOptionText(value, index, event.target.value))}
              placeholder={`Phương án ${index + 1}`}
              className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <button
              type="button"
              onClick={() => onChange(withoutOption(value, index))}
              disabled={value.options.length <= MIN_OPTIONS}
              aria-label={`Xóa phương án ${index + 1}`}
              className="shrink-0 rounded-md border border-gray-400 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Xóa
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...value, options: [...value.options, ""] })}
        disabled={value.options.length >= MAX_OPTIONS}
        className="self-start rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        Thêm phương án
      </button>
      {optionsError !== undefined ? (
        <p id="question-options-error" role="alert" className="text-sm text-red-600">{optionsError}</p>
      ) : null}
    </fieldset>
  );
}
