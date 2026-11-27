import type { FillBlankFormValue, FormBodyProps } from "../form-model.js";

const MIN_ANSWERS = 1;
const MAX_ANSWERS = 10;

interface FillBlankFormProps extends FormBodyProps<FillBlankFormValue> {
  onInsertBlank: () => void;
}

function withAnswer(value: FillBlankFormValue, index: number, text: string): FillBlankFormValue {
  return {
    ...value,
    acceptedAnswers: value.acceptedAnswers.map((answer, i) => (i === index ? text : answer)),
  };
}

export function FillBlankForm({ value, onChange, errors, onInsertBlank }: FillBlankFormProps) {
  const answersError = errors.acceptedAnswers;
  return (
    <fieldset id="question-accepted-answers" tabIndex={-1} className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
      <legend className="px-1 text-sm font-medium">Đáp án điền vào chỗ trống</legend>
      <p className="text-sm text-gray-600">
        Nội dung câu hỏi phải chứa đúng một <code className="rounded bg-gray-100 px-1">{"{{blank}}"}</code>.
      </p>
      <button
        type="button"
        onClick={onInsertBlank}
        className="self-start rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        Chèn {"{{blank}}"} vào nội dung
      </button>
      <div className="flex flex-col gap-2">
        {value.acceptedAnswers.map((answer, index) => (
          <div key={index} className="flex items-center gap-2">
            <label htmlFor={`fill-answer-${index}`} className="sr-only">
              Đáp án chấp nhận {index + 1}
            </label>
            <input
              id={`fill-answer-${index}`}
              type="text"
              value={answer}
              onChange={(event) => onChange(withAnswer(value, index, event.target.value))}
              placeholder={`Đáp án ${index + 1}`}
              className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  acceptedAnswers: value.acceptedAnswers.filter((_, i) => i !== index),
                })
              }
              disabled={value.acceptedAnswers.length <= MIN_ANSWERS}
              aria-label={`Xóa đáp án ${index + 1}`}
              className="shrink-0 rounded-md border border-gray-400 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Xóa
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...value, acceptedAnswers: [...value.acceptedAnswers, ""] })}
        disabled={value.acceptedAnswers.length >= MAX_ANSWERS}
        className="self-start rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        Thêm đáp án
      </button>
      {answersError !== undefined ? (
        <p id="question-accepted-answers-error" role="alert" className="text-sm text-red-600">{answersError}</p>
      ) : null}
    </fieldset>
  );
}
