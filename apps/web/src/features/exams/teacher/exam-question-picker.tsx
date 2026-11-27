import { useEffect, useRef, useState } from "react";
import { Difficulty, QuestionType, type QuestionListQueryDto } from "@quiz/shared";
import { listQuestions, listSubjects } from "@/features/questions/api.js";
import { RichContentRenderer } from "@/features/questions/rich-content-renderer.js";
import type { QuestionDtoWire, SubjectWire } from "@/features/questions/schemas.js";

const typeLabels: Record<QuestionType, string> = { SINGLE_CHOICE: "Trắc nghiệm một đáp án", MULTIPLE_CHOICE: "Trắc nghiệm nhiều đáp án", TRUE_FALSE: "Đúng / sai", FILL_BLANK: "Điền khuyết", MATCHING: "Nối cặp" };
const difficultyLabels: Record<Difficulty, string> = { EASY: "Dễ", MEDIUM: "Trung bình", HARD: "Khó" };
interface Props { disabled: boolean; onAdd: (sourceQuestionId: string) => Promise<boolean> }
function QuestionCard({ question, disabled, onAdd }: { question: QuestionDtoWire; disabled: boolean; onAdd: Props["onAdd"] }) {
  const [adding, setAdding] = useState(false);
  async function add() { setAdding(true); try { await onAdd(question.id); } finally { setAdding(false); } }
  return <li className="flex flex-col gap-2 rounded-md border border-gray-300 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-600">{typeLabels[question.type]} · {difficultyLabels[question.difficulty]} · {question.subjectName}</p><button type="button" disabled={disabled || adding} onClick={() => void add()} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{adding ? "Đang thêm…" : "Thêm câu"}</button></div><RichContentRenderer content={question.content} /></li>;
}
function usePickerData(query: QuestionListQueryDto) {
  const [items, setItems] = useState<QuestionDtoWire[]>([]);
  const [subjects, setSubjects] = useState<SubjectWire[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => { void listSubjects().then(setSubjects).catch(() => setError("Không thể tải danh sách môn học.")); }, []);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true); setError(null);
    void listQuestions({ ...query, page, pageSize: 10 }).then((result) => { if (id === requestId.current) { setItems(result.items); setTotalPages(result.totalPages); } }).catch(() => { if (id === requestId.current) setError("Không thể tải câu hỏi nguồn."); }).finally(() => { if (id === requestId.current) setLoading(false); });
  }, [page, query.subjectId, query.type, query.difficulty, query.q]);
  return { items, subjects, page, setPage, totalPages, loading, error };
}
type PickerValues = { subjectId: string; type: string; difficulty: string; q: string };
function Filters({ subjects, values, onChange }: { subjects: readonly SubjectWire[]; values: PickerValues; onChange: (field: keyof PickerValues, value: string) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label htmlFor="exam-question-search" className="flex flex-col gap-1 text-sm">Tìm câu<input id="exam-question-search" value={values.q} onChange={(event) => onChange("q", event.target.value)} className="rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" /></label><label htmlFor="exam-question-subject" className="flex flex-col gap-1 text-sm">Môn<select id="exam-question-subject" value={values.subjectId} onChange={(event) => onChange("subjectId", event.target.value)} className="rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><option value="">Tất cả môn</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label htmlFor="exam-question-type" className="flex flex-col gap-1 text-sm">Dạng câu<select id="exam-question-type" value={values.type} onChange={(event) => onChange("type", event.target.value)} className="rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><option value="">Tất cả dạng</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label htmlFor="exam-question-difficulty" className="flex flex-col gap-1 text-sm">Độ khó<select id="exam-question-difficulty" value={values.difficulty} onChange={(event) => onChange("difficulty", event.target.value)} className="rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><option value="">Tất cả mức độ</option>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
}
function queryFrom(values: { subjectId: string; type: string; difficulty: string; q: string }): QuestionListQueryDto {
  return { ...(values.subjectId ? { subjectId: values.subjectId } : {}), ...(values.type ? { type: values.type as QuestionType } : {}), ...(values.difficulty ? { difficulty: values.difficulty as Difficulty } : {}), ...(values.q.trim() ? { q: values.q.trim() } : {}) };
}
export function ExamQuestionPicker({ disabled, onAdd }: Props) {
  const [values, setValues] = useState({ subjectId: "", type: "", difficulty: "", q: "" });
  const query = queryFrom(values);
  const result = usePickerData(query);
  function change(field: keyof typeof values, value: string) { setValues((current) => ({ ...current, [field]: value })); result.setPage(1); }
  return <section className="flex flex-col gap-3"><h3 className="text-base font-semibold">Chọn câu từ ngân hàng</h3><Filters subjects={result.subjects} values={values} onChange={change} />{result.error && <p role="alert" className="text-sm text-red-700">{result.error}</p>}{result.loading && <p aria-live="polite" className="text-sm text-gray-600">Đang tải câu hỏi…</p>}{!result.loading && !result.error && result.items.length === 0 && <p className="rounded-md border border-gray-300 p-3 text-sm text-gray-600">Không có câu hỏi phù hợp.</p>}<ul className="flex flex-col gap-2">{result.items.map((question) => <QuestionCard key={question.id} question={question} disabled={disabled} onAdd={onAdd} />)}</ul><nav aria-label="Phân trang câu hỏi nguồn" className="flex items-center gap-2"><button type="button" disabled={result.page <= 1 || result.loading} onClick={() => result.setPage((current) => current - 1)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Trang trước</button><span aria-live="polite" className="text-sm">Trang {result.page} / {result.totalPages || 1}</span><button type="button" disabled={result.page >= result.totalPages || result.loading} onClick={() => result.setPage((current) => current + 1)} className="rounded-md border border-gray-400 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Trang tiếp</button></nav></section>;
}
