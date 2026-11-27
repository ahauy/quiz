import type { FormBodyProps, MatchingFormValue } from "../form-model.js";

const MIN_PAIRS = 2;
const MAX_PAIRS = 10;

function withPairText(
  value: MatchingFormValue,
  index: number,
  side: "leftText" | "rightText",
  text: string,
): MatchingFormValue {
  return {
    ...value,
    pairs: value.pairs.map((pair, i) => (i === index ? { ...pair, [side]: text } : pair)),
  };
}

export function MatchingForm({ value, onChange, errors }: FormBodyProps<MatchingFormValue>) {
  const pairsError = errors.pairs;
  return (
    <fieldset id="question-pairs" tabIndex={-1} className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
      <legend className="px-1 text-sm font-medium">Các cặp cần ghép (2–10 cặp)</legend>
      <div className="flex flex-col gap-2">
        {value.pairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-2">
            <label htmlFor={`matching-left-${index}`} className="sr-only">
              Vế trái cặp {index + 1}
            </label>
            <input
              id={`matching-left-${index}`}
              type="text"
              value={pair.leftText}
              onChange={(event) => onChange(withPairText(value, index, "leftText", event.target.value))}
              placeholder="Vế trái"
              className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <span aria-hidden="true" className="shrink-0 text-gray-600">↔</span>
            <label htmlFor={`matching-right-${index}`} className="sr-only">
              Vế phải cặp {index + 1}
            </label>
            <input
              id={`matching-right-${index}`}
              type="text"
              value={pair.rightText}
              onChange={(event) => onChange(withPairText(value, index, "rightText", event.target.value))}
              placeholder="Vế phải"
              className="w-full rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <button
              type="button"
              onClick={() => onChange({ ...value, pairs: value.pairs.filter((_, i) => i !== index) })}
              disabled={value.pairs.length <= MIN_PAIRS}
              aria-label={`Xóa cặp ${index + 1}`}
              className="shrink-0 rounded-md border border-gray-400 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Xóa
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...value, pairs: [...value.pairs, { leftText: "", rightText: "" }] })}
        disabled={value.pairs.length >= MAX_PAIRS}
        className="self-start rounded-md border border-gray-400 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        Thêm cặp
      </button>
      {pairsError !== undefined ? (
        <p id="question-pairs-error" role="alert" className="text-sm text-red-600">{pairsError}</p>
      ) : null}
    </fieldset>
  );
}
