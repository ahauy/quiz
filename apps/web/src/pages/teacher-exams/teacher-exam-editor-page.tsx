import { useCallback, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ExamStatus } from "@quiz/shared";
import type { TeacherExamWriteIntent } from "@/features/exams/teacher/use-draft-editor.js";
import { useDraftEditor } from "@/features/exams/teacher/use-draft-editor.js";
import { examRefreshDelayMs } from "@/features/exams/server-time.js";
import { DraftSettingsForm } from "@/features/exams/teacher/draft-settings-form.js";
import { ExamQuestionPicker } from "@/features/exams/teacher/exam-question-picker.js";
import { ExamSnapshotList } from "@/features/exams/teacher/exam-snapshot-list.js";
import { ExamAssignmentEditor } from "@/features/exams/teacher/exam-assignment-editor.js";
import { ExamLifecycleControls } from "@/features/exams/teacher/exam-lifecycle-controls.js";
import { ExamHistoryPanel } from "@/features/exams/teacher/exam-history-panel.js";
import { settingsFromExam, type DraftSettings } from "@/features/exams/teacher/use-draft-editor.js";

function useBoundaryRefresh(state: ReturnType<typeof useDraftEditor>["state"], reload: (id?: string) => Promise<void>) {
  useEffect(() => {
    const exam = state.exam;
    const boundary = exam?.state === "SCHEDULED" ? exam.opensAt : exam?.state === "OPEN" ? exam.closesAt : null;
    if (!exam || !boundary || !state.serverTime) return;
    const delay = examRefreshDelayMs(state.serverTime, boundary);
    if (delay === null) return;
    const maximumTimerDelay = 2_147_483_647;
    const timer = window.setTimeout(() => { void reload(exam.id); }, Math.min(delay, maximumTimerDelay));
    return () => window.clearTimeout(timer);
  }, [reload, state.exam, state.serverTime]);
  useEffect(() => {
    const examId = state.exam?.id;
    if (!examId) return;
    const refreshWhenFocused = () => { if (document.visibilityState === "visible") void reload(examId); };
    window.addEventListener("focus", refreshWhenFocused);
    document.addEventListener("visibilitychange", refreshWhenFocused);
    return () => {
      window.removeEventListener("focus", refreshWhenFocused);
      document.removeEventListener("visibilitychange", refreshWhenFocused);
    };
  }, [reload, state.exam?.id]);
}
function NewDraftForm({ editor, onCreated }: { editor: ReturnType<typeof useDraftEditor>; onCreated: (id: string) => void }) {
  function changeTitle(value: string) { editor.dispatch({ type: "settingChanged", field: "title", value }); }
  async function create() {
    const id = await editor.createDraft(editor.state.settings.title);
    if (id) onCreated(id);
  }
  async function check() {
    const id = await editor.checkUnknownOutcome();
    if (id) onCreated(id);
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void create(); }
  const canSubmit = editor.state.settings.title.trim().length > 0 && !editor.state.pending && editor.state.createRecovery !== "checking" && editor.state.createDuplicate === null && editor.state.unknownWrite === null && !editor.state.reviewRequired;
  return <form onSubmit={submit} className="flex max-w-xl flex-col gap-4 rounded-md border border-gray-300 p-4"><h1 className="text-xl font-semibold">Tạo đề thi</h1><label htmlFor="new-exam-title" className="flex flex-col gap-1 text-sm font-medium">Tên đề<input id="new-exam-title" required value={editor.state.settings.title} onChange={(event) => changeTitle(event.target.value)} className="rounded-md border border-gray-500 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" /></label><p className="text-sm text-gray-600">Nháp mới chỉ cần tên. Câu hỏi, lịch, chính sách và lớp có thể cấu hình sau khi lưu.</p>{editor.state.error && <p role="alert" className="text-sm text-red-700">{editor.state.error}</p>}{editor.state.notice && <p role="status" aria-live="polite" className="text-sm text-gray-700">{editor.state.notice}</p>}{editor.state.reviewRequired && editor.state.reviewExam && <section className="rounded-md border border-amber-500 bg-amber-50 p-3" aria-label="Đề đã thay đổi sau lần tạo"><h2 className="font-semibold">Cần xem lại đề hiện tại</h2><p className="mt-1 break-words text-sm">Đã lưu: {editor.state.reviewExam.title} · {examStateLabels[editor.state.reviewExam.state]}</p>{editor.state.unknownWrite?.kind === "create" && <p className="break-words text-sm">Tên đã gửi: {editor.state.unknownWrite.title}</p>}<p className="break-words text-sm">Tên bạn vừa nhập: {editor.state.settings.title}</p><button type="button" onClick={() => onCreated(editor.state.reviewExam!.id)} className="mt-3 rounded-md border border-gray-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Mở đề hiện tại để xem</button></section>}{editor.state.createDuplicate && <section className="rounded-md border border-amber-500 bg-amber-50 p-3" aria-label="Đề cùng mã đã tồn tại"><h2 className="font-semibold">Đã có đề cùng mã</h2><p className="mt-1 break-words text-sm">Đã lưu: {editor.state.createDuplicate.exam.title} · {examStateLabels[editor.state.createDuplicate.exam.state]}</p><p className="break-words text-sm">Tên bạn vừa nhập: {editor.state.createDuplicate.submittedTitle}</p><button type="button" onClick={() => onCreated(editor.state.createDuplicate!.exam.id)} className="mt-3 rounded-md border border-gray-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Mở đề hiện có để xem</button></section>}<div className="flex flex-wrap gap-2"><button type="submit" disabled={!canSubmit} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-50">{editor.state.pending ? "Đang lưu…" : editor.state.createRecovery === "new-intent-required" ? "Tạo nháp mới" : "Lưu nháp"}</button>{editor.state.unknownWrite?.kind === "create" && <button type="button" disabled={editor.state.pending} onClick={() => void check()} className="rounded-md border border-gray-500 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Kiểm tra trạng thái</button>}</div></form>;
}
function editorLocked(state: ReturnType<typeof useDraftEditor>["state"]): boolean {
  return !state.exam || state.exam.state !== "DRAFT" || state.pending || state.unknownWrite !== null || state.reviewRequired;
}
const comparableSettings: Array<[keyof DraftSettings, string]> = [["title", "Tên đề"], ["durationMinutes", "Thời lượng (phút)"], ["maxAttempts", "Số lượt làm bài"], ["allowAnswerReview", "Cho phép xem đáp án"], ["opensAt", "Giờ mở"], ["closesAt", "Giờ đóng"]];
const examStateLabels: Record<ExamStatus, string> = { DRAFT: "Nháp", SCHEDULED: "Chờ mở", OPEN: "Đang mở", CLOSED: "Đã đóng" };
function settingsDisplay(settings: DraftSettings, field: keyof DraftSettings): string {
  const value = settings[field];
  if (field === "allowAnswerReview") return value === "unset" ? "Chưa chọn" : value === "yes" ? "Cho phép" : "Không cho phép";
  return value === "" ? "Chưa đặt" : value;
}
function EditorPanels({ editor, onDeleted }: { editor: ReturnType<typeof useDraftEditor>; onDeleted: () => void }) {
  const locked = editorLocked(editor.state);
  async function action(input: TeacherExamWriteIntent, expectedVersion?: string) {
    const result = await editor.writeChild(input, expectedVersion);
    if (result) {
      if (input.op === "publish" || input.op === "withdraw" || input.op === "updateAssignments") await editor.refreshHistory(false);
      await editor.refreshQuestions(false);
      return true;
    }
    return false;
  }
  async function addQuestion(sourceQuestionId: string) { return action({ op: "addQuestion", sourceQuestionId }); }
  async function removeQuestion(snapshotId: string) { return action({ op: "removeQuestion", snapshotId }); }
  async function refreshQuestion(snapshotId: string) { return action({ op: "refreshQuestion", snapshotId }); }
  async function moveQuestion(snapshotId: string, beforeSnapshotId: string | null) { return action({ op: "moveQuestion", snapshotId, beforeSnapshotId }); }
  async function updateAssignments(addClassroomIds: string[], removeClassroomIds: string[], version: string) { return action({ op: "updateAssignments", addClassroomIds, removeClassroomIds }, version); }
  const reloadExam = useCallback(() => { void editor.loadExam(); }, [editor.loadExam]);
  const change = (field: keyof DraftSettings, value: string) => editor.dispatch({ type: "settingChanged", field, value });
  const reviewedSettings = editor.state.reviewExam ? settingsFromExam(editor.state.reviewExam) : null;
  const changed = reviewedSettings ? comparableSettings.filter(([field]) => editor.state.settings[field] !== reviewedSettings[field]) : [];
  return <><ExamLifecycleControls exam={editor.state.exam!} pending={editor.state.pending} locked={editor.state.unknownWrite !== null || editor.state.reviewRequired} onAction={(op) => action({ op })} onDelete={editor.deleteDraft} onDeleted={onDeleted} /><DraftSettingsForm state={editor.state} onChange={change} onSave={() => void editor.saveSettings()} locked={locked} /><ExamSnapshotList state={editor.state} locked={locked} version={editor.state.etag ?? ""} onReload={editor.refreshQuestions} onRemove={removeQuestion} onRefresh={refreshQuestion} onMove={moveQuestion} /><ExamQuestionPicker disabled={locked} onAdd={addQuestion} /><ExamAssignmentEditor examId={editor.state.exam!.id} locked={locked} version={editor.state.etag ?? ""} onSave={updateAssignments} onVersionMismatch={reloadExam} /><ExamHistoryPanel state={editor.state} onLoad={editor.refreshHistory} version={editor.state.etag ?? ""} />{editor.state.unknownWrite && <div className="rounded-md border border-amber-400 bg-amber-50 p-3"><p className="text-sm">Kết quả thao tác chưa rõ. Không gửi lại tự động.</p><button type="button" onClick={() => void editor.checkUnknownOutcome()} disabled={editor.state.pending} className="mt-2 rounded-md border border-amber-600 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">Kiểm tra trạng thái</button>{editor.state.unknownWrite.retry && !editor.state.reviewRequired && <button type="button" onClick={() => void editor.retryUnknownWrite()} disabled={editor.state.pending} className="ml-2 mt-2 rounded-md border border-amber-600 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">Thử lại đúng yêu cầu cũ</button>}</div>}{editor.state.reviewRequired && <div className="rounded-md border border-amber-400 bg-amber-50 p-3"><h2 className="font-semibold">Cần xem lại thay đổi</h2><p className="text-sm">Dữ liệu đã lưu thay đổi. Hãy so sánh trước khi tiếp tục.</p>{changed.length > 0 && <dl className="mt-3 grid gap-2 text-sm">{changed.map(([field, label]) => <div key={field} className="grid gap-1 sm:grid-cols-3"><dt className="font-medium">{label}</dt><dd className="break-words text-gray-700">Đã lưu: {settingsDisplay(reviewedSettings!, field)}</dd><dd className="break-words text-gray-700">Nhập của bạn: {settingsDisplay(editor.state.settings, field)}</dd></div>)}</dl>}<button type="button" onClick={() => void editor.loadExam()} className="mt-3 rounded-md border border-gray-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Đọc trạng thái mới</button><button type="button" onClick={() => editor.dispatch({ type: "rebaseReviewedState" })} disabled={!editor.state.reviewExam || editor.state.unknownWrite !== null} className="ml-2 mt-2 rounded-md border border-gray-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50">Dùng bản mới làm gốc, giữ thay đổi của tôi</button><button type="button" onClick={() => editor.dispatch({ type: editor.state.unknownWrite ? "acknowledgeReviewedOutcome" : "acceptReviewedState" })} disabled={!editor.state.reviewExam} className="ml-2 mt-2 rounded-md border border-gray-500 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50">{editor.state.unknownWrite ? "Đã đối chiếu, tiếp tục với bản mới" : "Bỏ thay đổi chưa lưu"}</button></div>}</>;
}
export function TeacherExamEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editor = useDraftEditor(id);
  useBoundaryRefresh(editor.state, editor.loadExam);
  const created = useCallback((examId: string) => navigate(`/teacher/exams/${examId}`, { replace: true }), [navigate]);
  useEffect(() => { if (editor.state.deleteConfirmed) navigate("/teacher/exams", { replace: true }); }, [editor.state.deleteConfirmed, navigate]);
  if (!id) return <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4"><Link to="/teacher/exams" className="self-start text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">← Danh sách đề</Link><NewDraftForm editor={editor} onCreated={created} /></main>;
  if (editor.state.loading && editor.state.exam?.id !== id) return <main className="mx-auto max-w-6xl p-4"><p aria-live="polite" aria-busy="true">Đang tải đề thi…</p></main>;
  if (!editor.state.exam || editor.state.exam.id !== id) return <main className="mx-auto flex max-w-6xl flex-col gap-3 p-4"><Link to="/teacher/exams" className="self-start text-sm text-blue-700 underline">← Danh sách đề</Link><p role="alert" className="text-sm text-red-700">{editor.state.error ?? "Không tìm thấy đề thi."}</p><button type="button" onClick={() => void editor.loadExam()} className="self-start rounded-md border border-gray-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Thử lại</button></main>;
  return <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-5 p-4"><Link to="/teacher/exams" className="self-start text-sm text-blue-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">← Danh sách đề</Link><header className="min-w-0"><h1 className="break-words text-xl font-semibold [overflow-wrap:anywhere]">{editor.state.exam.title}</h1><p className="mt-1 break-words text-sm text-gray-600 [overflow-wrap:anywhere]">ID đề: <code>{editor.state.exam.id}</code></p></header><EditorPanels editor={editor} onDeleted={() => navigate("/teacher/exams", { replace: true })} /></main>;
}
